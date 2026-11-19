import assert from 'node:assert/strict';
import { translateSql } from '../src/sql.js';

// SQL asli dari backend/src/routes/dashboard.js
const totals = `SELECT
       COUNT(*)::int AS total_aset,
       COALESCE(SUM(nilai_perolehan), 0)::numeric AS total_nilai_perolehan,
       COUNT(*) FILTER (WHERE status = 'Dipinjam')::int AS jumlah_dipinjam,
       COUNT(*) FILTER (WHERE kondisi IN ('Rusak Ringan','Rusak Berat'))::int AS jumlah_rusak
     FROM aset`;
const t = translateSql(totals);
assert.ok(!t.includes('::'), 'cast harus hilang');
assert.ok(!/FILTER/i.test(t), 'FILTER harus diganti');
assert.ok(t.includes("SUM(CASE WHEN status = 'Dipinjam' THEN 1 ELSE 0 END)"), t);
assert.ok(t.includes("SUM(CASE WHEN kondisi IN ('Rusak Ringan','Rusak Berat') THEN 1 ELSE 0 END)"), 'kondisi bersarang harus utuh: ' + t);

// generateAsetKode: SUBSTRING(x FROM n) + CAST
const gen = `SELECT COALESCE(MAX(CAST(SUBSTRING(kode FROM 9) AS INT)), 0) AS mx FROM aset WHERE kode LIKE $1`;
const g = translateSql(gen);
assert.ok(g.includes('SUBSTR(kode, 9)'), g);
assert.ok(!/::/.test(g));

// to_char(date_trunc(...))
const tren = `SELECT to_char(date_trunc('month', tgl_pinjam), 'YYYY-MM') AS bulan, COUNT(*)::int AS jumlah FROM peminjaman GROUP BY date_trunc('month', tgl_pinjam)`;
const tr = translateSql(tren);
assert.ok(tr.includes("strftime('%Y-%m', tgl_pinjam)"), tr);
assert.ok(tr.includes("date(tgl_pinjam, 'start of month')"), tr);

// INTERVAL harus jadi date() utuh, bukan argumen menggantung
const iv = `SELECT COUNT(*)::int AS t FROM servis WHERE jadwal_berikutnya <= CURRENT_DATE + INTERVAL '7 days'`;
const ivt = translateSql(iv);
assert.equal(ivt, `SELECT COUNT(*) AS t FROM servis WHERE jadwal_berikutnya <= date('now', '+7 day')`);

const ivMinus = `SELECT COUNT(*)::int AS t FROM peminjaman WHERE tgl_pinjam >= (CURRENT_DATE - INTERVAL '6 months')`;
assert.equal(
  translateSql(ivMinus),
  `SELECT COUNT(*) AS t FROM peminjaman WHERE tgl_pinjam >= (date('now', '-6 month'))`
);

// ILIKE
assert.equal(translateSql('SELECT * FROM aset WHERE nama ILIKE $1'), 'SELECT * FROM aset WHERE nama LIKE ?'.replace('?', '$1'));

// boolean literal di luar string tidak boleh merusak nilai string
const b = translateSql("SELECT * FROM users WHERE aktif = TRUE AND nama = 'TRUE STORY'");
assert.ok(b.includes('aktif = 1'), b);
assert.ok(b.includes("'TRUE STORY'"), 'string literal harus utuh: ' + b);

console.log('sql translator: semua assert lolos');
console.log('--- hasil totals ---\n' + t);
console.log('--- hasil interval ---\n' + ivt);