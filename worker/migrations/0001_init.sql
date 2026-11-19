-- SARPRAS Asset Management — Cloudflare D1 (SQLite)
-- Port dari backend/src/schema.sql (PostgreSQL 16).
-- Perbedaan sengaja: SERIAL->INTEGER PK AUTOINCREMENT, NUMERIC->REAL,
-- JSONB->TEXT, BOOLEAN->INTEGER 0/1, UUID default di-generate aplikasi.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    nama            TEXT    NOT NULL,
    email           TEXT,
    role            TEXT    NOT NULL DEFAULT 'petugas'
                    CHECK (role IN ('admin','petugas','pimpinan')),
    aktif           INTEGER NOT NULL DEFAULT 1,
    last_login      TEXT,
    dibuat_pada     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kategori (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nama                TEXT    NOT NULL UNIQUE,
    deskripsi           TEXT,
    umur_ekonomis_tahun INTEGER NOT NULL DEFAULT 5
                        CHECK (umur_ekonomis_tahun > 0),
    persen_penyusutan   REAL    NOT NULL DEFAULT 20.00
                        CHECK (persen_penyusutan > 0 AND persen_penyusutan <= 100),
    akun_penyusutan     TEXT,
    dibuat_pada         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sumber_dana (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    nama                   TEXT NOT NULL UNIQUE,
    kode                   TEXT UNIQUE,
    tahun_anggaran         INTEGER,
    ketentuan_penghapusan  TEXT,
    dibuat_pada            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lokasi (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nama              TEXT NOT NULL UNIQUE,
    gedung            TEXT,
    lantai            TEXT,
    penanggung_jawab  TEXT,
    parent_id         INTEGER REFERENCES lokasi(id) ON DELETE SET NULL,
    dibuat_pada       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lokasi_parent ON lokasi(parent_id);

CREATE TABLE IF NOT EXISTS gudang_transit (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_barang    TEXT    NOT NULL,
    pengirim       TEXT,
    tgl_terima     TEXT    NOT NULL DEFAULT (date('now')),
    qty            INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
    qc_status      TEXT    NOT NULL DEFAULT 'Menunggu'
                   CHECK (qc_status IN ('Menunggu','Lolos','Ditolak')),
    catatan_qc     TEXT,
    aset_kode      TEXT,
    dibuat_pada    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gudang_status ON gudang_transit(qc_status);

CREATE TABLE IF NOT EXISTS aset (
    kode               TEXT PRIMARY KEY,
    nama               TEXT NOT NULL,
    kategori_id        INTEGER NOT NULL REFERENCES kategori(id),
    lokasi_id          INTEGER REFERENCES lokasi(id),
    sumber_dana_id     INTEGER REFERENCES sumber_dana(id),
    merk               TEXT,
    tipe               TEXT,
    no_seri            TEXT,
    tanggal_perolehan  TEXT NOT NULL DEFAULT (date('now')),
    nilai_perolehan    REAL NOT NULL DEFAULT 0 CHECK (nilai_perolehan >= 0),
    kondisi            TEXT NOT NULL DEFAULT 'Baik'
                       CHECK (kondisi IN ('Baik','Rusak Ringan','Rusak Berat')),
    status             TEXT NOT NULL DEFAULT 'Aktif'
                       CHECK (status IN ('Aktif','Dipinjam','Servis','Mutasi','Dihapus')),
    qr_token           TEXT NOT NULL UNIQUE,
    foto_url           TEXT,
    ada_di_fisik       INTEGER,
    dibuat_pada        TEXT NOT NULL DEFAULT (datetime('now')),
    diupdate_pada      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_aset_kategori ON aset(kategori_id);
CREATE INDEX IF NOT EXISTS idx_aset_lokasi   ON aset(lokasi_id);
CREATE INDEX IF NOT EXISTS idx_aset_status   ON aset(status);

CREATE TRIGGER IF NOT EXISTS trg_aset_updated
    AFTER UPDATE ON aset
    FOR EACH ROW
    BEGIN
        UPDATE aset SET diupdate_pada = datetime('now') WHERE kode = NEW.kode;
    END;

CREATE TABLE IF NOT EXISTS peminjaman (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    aset_kode            TEXT NOT NULL REFERENCES aset(kode),
    peminjam             TEXT NOT NULL,
    unit                 TEXT,
    keperluan            TEXT,
    tgl_pinjam           TEXT NOT NULL DEFAULT (date('now')),
    tgl_kembali_rencana  TEXT NOT NULL,
    tgl_kembali_aktual   TEXT,
    status               TEXT NOT NULL DEFAULT 'Dipinjam'
                         CHECK (status IN ('Dipinjam','Dikembalikan','Terlambat')),
    denda                REAL NOT NULL DEFAULT 0 CHECK (denda >= 0),
    dibuat_pada          TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (tgl_kembali_rencana >= tgl_pinjam)
);
CREATE INDEX IF NOT EXISTS idx_pinjam_aset   ON peminjaman(aset_kode);
CREATE INDEX IF NOT EXISTS idx_pinjam_status ON peminjaman(status);

CREATE TABLE IF NOT EXISTS mutasi (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    aset_kode         TEXT NOT NULL REFERENCES aset(kode),
    lokasi_asal_id    INTEGER REFERENCES lokasi(id),
    lokasi_tujuan_id  INTEGER NOT NULL REFERENCES lokasi(id),
    tanggal           TEXT NOT NULL DEFAULT (date('now')),
    alasan            TEXT,
    no_bast           TEXT,
    disetujui_oleh    INTEGER REFERENCES users(id),
    dibuat_pada       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mutasi_aset ON mutasi(aset_kode);

CREATE TABLE IF NOT EXISTS servis (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    aset_kode          TEXT NOT NULL REFERENCES aset(kode),
    jenis              TEXT NOT NULL CHECK (jenis IN ('Kuratif','Preventif')),
    tanggal            TEXT NOT NULL DEFAULT (date('now')),
    jadwal_berikutnya  TEXT,
    masalah            TEXT,
    tindakan           TEXT,
    biaya              REAL NOT NULL DEFAULT 0 CHECK (biaya >= 0),
    vendor             TEXT,
    status             TEXT NOT NULL DEFAULT 'Antri'
                       CHECK (status IN ('Antri','Proses','Selesai')),
    dibuat_pada        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_servis_aset  ON servis(aset_kode);
CREATE INDEX IF NOT EXISTS idx_servis_jenis ON servis(jenis);

CREATE TABLE IF NOT EXISTS penyusutan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    aset_kode       TEXT NOT NULL REFERENCES aset(kode),
    tahun           INTEGER NOT NULL,
    metode          TEXT NOT NULL DEFAULT 'Garis Lurus'
                    CHECK (metode IN ('Garis Lurus','Saldo Menurun')),
    nilai_awal      REAL NOT NULL,
    beban_tahunan   REAL NOT NULL DEFAULT 0,
    akumulasi       REAL NOT NULL DEFAULT 0,
    nilai_buku      REAL NOT NULL,
    nilai_wajar     REAL,
    UNIQUE (aset_kode, tahun)
);
CREATE INDEX IF NOT EXISTS idx_penyusutan_aset ON penyusutan(aset_kode);

CREATE TABLE IF NOT EXISTS penghapusan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    aset_kode       TEXT NOT NULL REFERENCES aset(kode),
    metode          TEXT NOT NULL CHECK (metode IN ('Musnah','Lelang','Hibah')),
    tanggal         TEXT NOT NULL DEFAULT (date('now')),
    nilai_buku      REAL NOT NULL DEFAULT 0,
    nilai_lelang    REAL,
    alasan          TEXT,
    status          TEXT NOT NULL DEFAULT 'Usulan'
                    CHECK (status IN ('Usulan','Disetujui','Ditolak')),
    disetujui_oleh  INTEGER REFERENCES users(id),
    dibuat_pada     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dokumen (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    aset_kode     TEXT NOT NULL REFERENCES aset(kode) ON DELETE CASCADE,
    jenis         TEXT NOT NULL
                  CHECK (jenis IN ('Faktur','BAST','Kwitansi','Garansi','Lainnya')),
    nama_file     TEXT NOT NULL,
    url           TEXT NOT NULL,
    diunggah_oleh INTEGER REFERENCES users(id),
    unggah_pada   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verifikasi (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    kode              TEXT NOT NULL UNIQUE,
    nama              TEXT NOT NULL,
    tanggal_mulai     TEXT NOT NULL DEFAULT (date('now')),
    tanggal_selesai   TEXT,
    status            TEXT NOT NULL DEFAULT 'Berjalan'
                      CHECK (status IN ('Berjalan','Selesai')),
    dijalankan_oleh   INTEGER REFERENCES users(id),
    dibuat_pada       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opname_item (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    verifikasi_id     INTEGER NOT NULL REFERENCES verifikasi(id) ON DELETE CASCADE,
    aset_kode         TEXT NOT NULL REFERENCES aset(kode),
    ditemukan         INTEGER NOT NULL DEFAULT 1,
    kondisi_fisik     TEXT,
    lokasi_temuan_id  INTEGER REFERENCES lokasi(id),
    catatan           TEXT,
    UNIQUE (verifikasi_id, aset_kode)
);
CREATE INDEX IF NOT EXISTS idx_opname_verif ON opname_item(verifikasi_id);

CREATE TABLE IF NOT EXISTS audit_trail (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    entitas     TEXT NOT NULL,
    entitas_id  TEXT,
    aksi        TEXT NOT NULL
                CHECK (aksi IN ('CREATE','UPDATE','DELETE','LOGIN','LOGOUT')),
    sebelum     TEXT,
    sesudah     TEXT,
    ip          TEXT,
    user_agent  TEXT,
    waktu       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entitas ON audit_trail(entitas, entitas_id);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_waktu   ON audit_trail(waktu DESC);

CREATE TABLE IF NOT EXISTS asset_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    aset_kode  TEXT NOT NULL REFERENCES aset(kode) ON DELETE CASCADE,
    aksi       TEXT NOT NULL,
    aktor      TEXT,
    detail     TEXT,
    waktu      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assetlog_aset ON asset_log(aset_kode, waktu DESC);