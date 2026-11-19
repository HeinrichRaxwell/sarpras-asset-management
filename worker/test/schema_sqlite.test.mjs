// Validasi nyata: jalankan schema D1 di SQLite sungguhan, lalu eksekusi
// SQL hasil translateSql dari route asli. Bukan assert string — SQL harus jalan.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { translateSql } from '../src/sql.js';
import { toSqlite, toParams } from '../src/db.js';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');

const schema = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
db.exec(schema);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
assert.equal(tables.length, 16, 'harus 16 tabel: ' + tables.map(t => t.name).join(','));
console.log('schema D1 diterapkan, 16 tabel:', tables.map(t => t.name).join(', '));

// seed minimum agar query agregat punya baris
db.exec(`
INSERT INTO users (username,password_hash,nama,role) VALUES ('admin','x','Admin','admin');
INSERT INTO kategori (nama,umur_ekonomis_tahun,persen_penyusutan) VALUES ('Elektronik',5,20);
INSERT INTO lokasi (nama,gedung,lantai) VALUES ('Ruang 301','A','3');
INSERT INTO sumber_dana (nama,kode) VALUES ('BOS','BOS');
INSERT INTO aset (kode,nama,kategori_id,lokasi_id,sumber_dana_id,nilai_perolehan,status,kondisi,qr_token)
  VALUES ('AM-2026-0001','Laptop',1,1,1,15000000,'Dipinjam','Baik','tok-1'),
         ('AM-2026-0002','Meja',1,1,1,2000000,'Aktif','Rusak Ringan','tok-2');
INSERT INTO peminjaman (aset_kode,peminjam,tgl_pinjam,tgl_kembali_rencana,status)
  VALUES ('AM-2026-0001','Budi',date('now','-2 month'),date('now','-1 month'),'Dipinjam');
INSERT INTO servis (aset_kode,jenis,jadwal_berikutnya,status) VALUES ('AM-2026-0002','Preventif',date('now','+3 day'),'Antri');
INSERT INTO penyusutan (aset_kode,tahun,nilai_awal,beban_tahunan,akumulasi,nilai_buku)
  VALUES ('AM-2026-0001',2025,15000000,3000000,3000000,12000000),
         ('AM-2026-0001',2026,15000000,3000000,6000000,9000000);
`);

function run(label, pgSql, params = []) {
  const sql = toSqlite(translateSql(pgSql));
  const binds = toParams(pgSql, params);
  try {
    const rows = db.prepare(sql).all(...binds);
    console.log(`OK  ${label}`);
    return rows;
  } catch (err) {
    console.error(`FAIL ${label}\n  SQL: ${sql}\n  ERR: ${err.message}`);
    throw err;
  }
}

// --- SQL asli dari dashboard.js ---
const totals = run('dashboard totals (FILTER + cast)', `SELECT
       COUNT(*)::int AS total_aset,
       COALESCE(SUM(nilai_perolehan), 0)::numeric AS total_nilai_perolehan,
       COUNT(*) FILTER (WHERE status = 'Dipinjam')::int AS jumlah_dipinjam,
       COUNT(*) FILTER (WHERE status = 'Servis')::int AS jumlah_servis,
       COUNT(*) FILTER (WHERE kondisi IN ('Rusak Ringan','Rusak Berat'))::int AS jumlah_rusak
     FROM aset`)[0];
assert.equal(totals.total_aset, 2);
assert.equal(totals.jumlah_dipinjam, 1);
assert.equal(totals.jumlah_rusak, 1);
assert.equal(totals.total_nilai_perolehan, 17000000);

run('dashboard byKategori', `SELECT k.id, k.nama, COUNT(a.kode)::int AS jumlah, COALESCE(SUM(a.nilai_perolehan), 0)::numeric AS nilai
     FROM kategori k LEFT JOIN aset a ON a.kategori_id = k.id
     GROUP BY k.id, k.nama ORDER BY nilai DESC`);

run('dashboard trenPeminjaman (to_char/date_trunc/INTERVAL)', `SELECT to_char(date_trunc('month', tgl_pinjam), 'YYYY-MM') AS bulan, COUNT(*)::int AS jumlah
     FROM peminjaman
     WHERE tgl_pinjam >= (CURRENT_DATE - INTERVAL '6 months')
     GROUP BY date_trunc('month', tgl_pinjam)
     ORDER BY bulan`);

const jatuhTempo = run('dashboard servisJatuhTempo (INTERVAL +)', `SELECT COUNT(*)::int AS t FROM servis
     WHERE jenis = 'Preventif' AND jadwal_berikutnya IS NOT NULL
       AND jadwal_berikutnya <= CURRENT_DATE + INTERVAL '7 days'
       AND status <> 'Selesai'`)[0].t;
assert.equal(jatuhTempo, 1);

const terlambat = run('dashboard peminjamanTerlambat', `SELECT COUNT(*)::int AS t FROM peminjaman
     WHERE status = 'Dipinjam' AND tgl_kembali_rencana < CURRENT_DATE`)[0].t;
assert.equal(terlambat, 1);

// --- generateAsetKode: SUBSTRING FROM + CAST ---
const mx = run('generateAsetKode (SUBSTRING FROM)', `SELECT COALESCE(MAX(CAST(SUBSTRING(kode FROM 9) AS INT)), 0) AS mx
     FROM aset WHERE kode LIKE $1`, ['AM-2026-%'])[0].mx;
assert.equal(mx, 2, 'kode terakhir 0002 -> mx=2');

// --- listResponse: COUNT + LIMIT/OFFSET + ILIKE berulang ---
run('listResponse count (ILIKE x3)', `SELECT COUNT(*)::int AS t FROM aset a WHERE (a.nama ILIKE $1 OR a.kode ILIKE $1 OR COALESCE(a.merk,'') ILIKE $1)`, ['%lap%']);
const list = run('listResponse rows (LIMIT/OFFSET)', `SELECT a.* FROM aset a WHERE (a.nama ILIKE $1 OR a.kode ILIKE $1) ORDER BY a.kode LIMIT $2 OFFSET $3`, ['%a%', 10, 0]);
assert.equal(list.length, 2);

// --- boolean literal ---
const aktif = run('users aktif = TRUE', `SELECT id FROM users WHERE aktif = TRUE`);
assert.equal(aktif.length, 1);

// --- DISTINCT ON (PG-only) harus diganti window function ---
const dep = run('nilai buku terbaru per aset (window, ganti DISTINCT ON)', `SELECT aset_kode, nilai_buku FROM (
       SELECT aset_kode, nilai_buku, ROW_NUMBER() OVER (PARTITION BY aset_kode ORDER BY tahun DESC) AS rn
       FROM penyusutan
     ) WHERE rn = 1`);
assert.equal(dep.length, 1);
assert.equal(dep[0].nilai_buku, 9000000, 'harus tahun terbaru 2026');

// --- trigger diupdate_pada ---
db.exec(`UPDATE aset SET nama = 'Laptop Baru' WHERE kode = 'AM-2026-0001'`);
const upd = db.prepare(`SELECT dibuat_pada, diupdate_pada FROM aset WHERE kode='AM-2026-0001'`).get();
assert.ok(upd.diupdate_pada >= upd.dibuat_pada, 'trigger harus memperbarui diupdate_pada');
console.log('OK  trigger trg_aset_updated');

console.log('\nSEMUA SQL VALID DI SQLITE NYATA');