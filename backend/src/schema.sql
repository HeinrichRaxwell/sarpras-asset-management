-- =====================================================================
-- SISTEM MANAJEMEN SARANA DAN PRASARANA (ASSET MANAGEMENT)
-- Database: PostgreSQL 16
-- =====================================================================

-- Aktifkan extension untuk UUID (QR token)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. USERS — autentikasi & RBAC
-- =====================================================================
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,          -- bcrypt
    nama            VARCHAR(100) NOT NULL,
    email           VARCHAR(120),
    role            VARCHAR(20)  NOT NULL DEFAULT 'petugas'
                    CHECK (role IN ('admin','petugas','pimpinan')),
    aktif           BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login      TIMESTAMP,
    dibuat_pada     TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 2. KATEGORI — jenis aset + aturan penyusutan
-- =====================================================================
CREATE TABLE kategori (
    id                  SERIAL PRIMARY KEY,
    nama                VARCHAR(100) NOT NULL,       -- Elektronik, Meubelair, Kendaraan
    deskripsi           TEXT,
    umur_ekonomis_tahun INT          NOT NULL DEFAULT 5
                        CHECK (umur_ekonomis_tahun > 0),
    persen_penyusutan   NUMERIC(5,2) NOT NULL DEFAULT 20.00
                        CHECK (persen_penyusutan > 0 AND persen_penyusutan <= 100),
    akun_penyusutan     VARCHAR(20),                 -- kode COA, mis. 1.2.3.01
    dibuat_pada         TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 3. SUMBER_DANA — asal perolehan (menentukan aturan penghapusan)
-- =====================================================================
CREATE TABLE sumber_dana (
    id                     SERIAL PRIMARY KEY,
    nama                   VARCHAR(80) NOT NULL,    -- APBD, APBN, Hibah, BOS, Wakaf
    kode                   VARCHAR(20) UNIQUE,
    tahun_anggaran         INT,
    ketentuan_penghapusan  TEXT,
    dibuat_pada            TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 4. LOKASI — hierarki Gedung > Lantai > Ruang
-- =====================================================================
CREATE TABLE lokasi (
    id                SERIAL PRIMARY KEY,
    nama              VARCHAR(120) NOT NULL,         -- Ruang 301
    gedung            VARCHAR(80),
    lantai            VARCHAR(20),
    penanggung_jawab  VARCHAR(100),
    parent_id         INT REFERENCES lokasi(id) ON DELETE SET NULL,
    dibuat_pada       TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lokasi_parent ON lokasi(parent_id);

-- =====================================================================
-- 5. GUDANG_TRANSIT — QC barang masuk sebelum jadi aset
-- =====================================================================
CREATE TABLE gudang_transit (
    id             SERIAL PRIMARY KEY,
    nama_barang    VARCHAR(200) NOT NULL,
    pengirim       VARCHAR(150),
    tgl_terima     DATE         NOT NULL DEFAULT CURRENT_DATE,
    qty            INT          NOT NULL DEFAULT 1 CHECK (qty > 0),
    qc_status      VARCHAR(20)  NOT NULL DEFAULT 'Menunggu'
                   CHECK (qc_status IN ('Menunggu','Lolos','Ditolak')),
    catatan_qc     TEXT,
    aset_kode      VARCHAR(30),                     -- diisi saat QC Lolos → jadi aset
    dibuat_pada    TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gudang_status ON gudang_transit(qc_status);

-- =====================================================================
-- 6. ASET — katalog utama (tabel inti)
-- =====================================================================
CREATE TABLE aset (
    kode               VARCHAR(30) PRIMARY KEY,      -- AM-2024-0001
    nama               VARCHAR(200) NOT NULL,
    kategori_id        INT NOT NULL REFERENCES kategori(id),
    lokasi_id          INT REFERENCES lokasi(id),
    sumber_dana_id     INT REFERENCES sumber_dana(id),
    merk               VARCHAR(80),
    tipe               VARCHAR(80),
    no_seri            VARCHAR(80),
    tanggal_perolehan  DATE NOT NULL DEFAULT CURRENT_DATE,
    nilai_perolehan    NUMERIC(18,2) NOT NULL DEFAULT 0
                       CHECK (nilai_perolehan >= 0),
    kondisi            VARCHAR(20) NOT NULL DEFAULT 'Baik'
                       CHECK (kondisi IN ('Baik','Rusak Ringan','Rusak Berat')),
    status             VARCHAR(20) NOT NULL DEFAULT 'Aktif'
                       CHECK (status IN ('Aktif','Dipinjam','Servis','Mutasi','Dihapus')),
    qr_token           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    foto_url           TEXT,
    ada_di_fisik       BOOLEAN,                        -- hasil stock opname terakhir
    dibuat_pada        TIMESTAMP NOT NULL DEFAULT NOW(),
    diupdate_pada      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_aset_kategori ON aset(kategori_id);
CREATE INDEX idx_aset_lokasi   ON aset(lokasi_id);
CREATE INDEX idx_aset_status   ON aset(status);

-- =====================================================================
-- 7. PEMINJAMAN
-- =====================================================================
CREATE TABLE peminjaman (
    id                   SERIAL PRIMARY KEY,
    aset_kode            VARCHAR(30) NOT NULL REFERENCES aset(kode),
    peminjam             VARCHAR(120) NOT NULL,
    unit                 VARCHAR(120),
    keperluan            TEXT,
    tgl_pinjam           DATE NOT NULL DEFAULT CURRENT_DATE,
    tgl_kembali_rencana  DATE NOT NULL,
    tgl_kembali_aktual   DATE,
    status               VARCHAR(20) NOT NULL DEFAULT 'Dipinjam'
                         CHECK (status IN ('Dipinjam','Dikembalikan','Terlambat')),
    denda                NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (denda >= 0),
    dibuat_pada          TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (tgl_kembali_rencana >= tgl_pinjam)
);
CREATE INDEX idx_pinjam_aset   ON peminjaman(aset_kode);
CREATE INDEX idx_pinjam_status ON peminjaman(status);

-- =====================================================================
-- 8. MUTASI — perpindahan antar ruang
-- =====================================================================
CREATE TABLE mutasi (
    id                SERIAL PRIMARY KEY,
    aset_kode         VARCHAR(30) NOT NULL REFERENCES aset(kode),
    lokasi_asal_id    INT REFERENCES lokasi(id),
    lokasi_tujuan_id  INT NOT NULL REFERENCES lokasi(id),
    tanggal           DATE NOT NULL DEFAULT CURRENT_DATE,
    alasan            TEXT,
    no_bast           VARCHAR(50),                    -- Berita Acara Serah Terima
    disetujui_oleh    INT REFERENCES users(id),
    dibuat_pada       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mutasi_aset ON mutasi(aset_kode);

-- =====================================================================
-- 9. SERVIS — kuratif & preventif
-- =====================================================================
CREATE TABLE servis (
    id                 SERIAL PRIMARY KEY,
    aset_kode          VARCHAR(30) NOT NULL REFERENCES aset(kode),
    jenis              VARCHAR(20) NOT NULL
                       CHECK (jenis IN ('Kuratif','Preventif')),
    tanggal            DATE NOT NULL DEFAULT CURRENT_DATE,
    jadwal_berikutnya  DATE,                            -- khusus preventif
    masalah            TEXT,
    tindakan           TEXT,
    biaya              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (biaya >= 0),
    vendor             VARCHAR(120),
    status             VARCHAR(20) NOT NULL DEFAULT 'Antri'
                       CHECK (status IN ('Antri','Proses','Selesai')),
    dibuat_pada        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_servis_aset  ON servis(aset_kode);
CREATE INDEX idx_servis_jenis ON servis(jenis);

-- =====================================================================
-- 10. PENYUSUTAN — perhitungan per tahun per aset
-- =====================================================================
CREATE TABLE penyusutan (
    id              SERIAL PRIMARY KEY,
    aset_kode       VARCHAR(30) NOT NULL REFERENCES aset(kode),
    tahun           INT NOT NULL,
    metode          VARCHAR(20) NOT NULL DEFAULT 'Garis Lurus'
                    CHECK (metode IN ('Garis Lurus','Saldo Menurun')),
    nilai_awal      NUMERIC(18,2) NOT NULL,
    beban_tahunan   NUMERIC(18,2) NOT NULL DEFAULT 0,
    akumulasi       NUMERIC(18,2) NOT NULL DEFAULT 0,
    nilai_buku      NUMERIC(18,2) NOT NULL,
    nilai_wajar     NUMERIC(18,2),                  -- untuk uji impairment
    UNIQUE (aset_kode, tahun)
);
CREATE INDEX idx_penyusutan_aset ON penyusutan(aset_kode);

-- =====================================================================
-- 11. PENGHAPUSAN — musnah / lelang / hibah
-- =====================================================================
CREATE TABLE penghapusan (
    id              SERIAL PRIMARY KEY,
    aset_kode       VARCHAR(30) NOT NULL REFERENCES aset(kode),
    metode          VARCHAR(20) NOT NULL
                    CHECK (metode IN ('Musnah','Lelang','Hibah')),
    tanggal         DATE NOT NULL DEFAULT CURRENT_DATE,
    nilai_buku      NUMERIC(18,2) NOT NULL DEFAULT 0,
    nilai_lelang    NUMERIC(18,2),
    alasan          TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'Usulan'
                    CHECK (status IN ('Usulan','Disetujui','Ditolak')),
    disetujui_oleh  INT REFERENCES users(id),
    dibuat_pada     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 12. DOKUMEN — lampiran per aset
-- =====================================================================
CREATE TABLE dokumen (
    id            SERIAL PRIMARY KEY,
    aset_kode     VARCHAR(30) NOT NULL REFERENCES aset(kode) ON DELETE CASCADE,
    jenis         VARCHAR(30) NOT NULL
                  CHECK (jenis IN ('Faktur','BAST','Kwitansi','Garansi','Lainnya')),
    nama_file     VARCHAR(255) NOT NULL,
    url           TEXT NOT NULL,
    diunggah_oleh INT REFERENCES users(id),
    unggah_pada   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 13. VERIFIKASI — sesi stock opname / inventarisasi fisik
-- =====================================================================
CREATE TABLE verifikasi (
    id                SERIAL PRIMARY KEY,
    kode              VARCHAR(30) NOT NULL UNIQUE,    -- OPN-2024-Q1
    nama              VARCHAR(150) NOT NULL,
    tanggal_mulai     DATE NOT NULL DEFAULT CURRENT_DATE,
    tanggal_selesai   DATE,
    status            VARCHAR(20) NOT NULL DEFAULT 'Berjalan'
                      CHECK (status IN ('Berjalan','Selesai')),
    dijalankan_oleh   INT REFERENCES users(id),
    dibuat_pada       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Item hasil opname (rekonsiliasi fisik vs data)
CREATE TABLE opname_item (
    id                SERIAL PRIMARY KEY,
    verifikasi_id     INT NOT NULL REFERENCES verifikasi(id) ON DELETE CASCADE,
    aset_kode         VARCHAR(30) NOT NULL REFERENCES aset(kode),
    ditemukan         BOOLEAN NOT NULL DEFAULT TRUE,
    kondisi_fisik     VARCHAR(20),
    lokasi_temuan_id  INT REFERENCES lokasi(id),
    catatan           TEXT,
    UNIQUE (verifikasi_id, aset_kode)
);
CREATE INDEX idx_opname_verif ON opname_item(verifikasi_id);

-- =====================================================================
-- 14. AUDIT_TRAIL — jejak seluruh perubahan (immutable log)
-- =====================================================================
CREATE TABLE audit_trail (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(id),
    entitas     VARCHAR(50) NOT NULL,                -- aset / peminjaman / ...
    entitas_id  VARCHAR(30),
    aksi        VARCHAR(20) NOT NULL
                CHECK (aksi IN ('CREATE','UPDATE','DELETE','LOGIN','LOGOUT')),
    sebelum     JSONB,
    sesudah     JSONB,
    ip          VARCHAR(45),
    user_agent  TEXT,
    waktu       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_entitas ON audit_trail(entitas, entitas_id);
CREATE INDEX idx_audit_user    ON audit_trail(user_id);
CREATE INDEX idx_audit_waktu   ON audit_trail(waktu DESC);

-- =====================================================================
-- 15. ASSET_LOG — riwayat peristiwa operasional per aset
-- =====================================================================
CREATE TABLE asset_log (
    id         SERIAL PRIMARY KEY,
    aset_kode  VARCHAR(30) NOT NULL REFERENCES aset(kode) ON DELETE CASCADE,
    aksi       VARCHAR(50) NOT NULL,                -- 'Masuk','Dipinjam','Mutasi',...
    aktor      VARCHAR(100),
    detail     JSONB,
    waktu      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_assetlog_aset ON asset_log(aset_kode, waktu DESC);

-- =====================================================================
-- Helper: auto-update kolom diupdate_pada pada tabel aset
-- =====================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.diupdate_pada = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_aset_updated
    BEFORE UPDATE ON aset
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();