// Dashboard routes — aggregated KPIs & alerts
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { wrap } = require('./_helpers');

const router = express.Router();
router.use(authenticate);

// GET /api/dashboard
router.get('/', wrap(async (_req, res) => {
  const totals = (await query(
    `SELECT
       COUNT(*)::int AS total_aset,
       COALESCE(SUM(nilai_perolehan), 0)::numeric AS total_nilai_perolehan,
       COUNT(*) FILTER (WHERE status = 'Dipinjam')::int AS jumlah_dipinjam,
       COUNT(*) FILTER (WHERE status = 'Servis')::int AS jumlah_servis,
       COUNT(*) FILTER (WHERE kondisi IN ('Rusak Ringan','Rusak Berat'))::int AS jumlah_rusak
     FROM aset`
  )).rows[0];

  // Latest known book value per asset (fallback to acquisition value)
  const nilaiBuku = (await query(
    `SELECT COALESCE(SUM(v.nilai_buku), 0)::numeric AS total
     FROM (
       SELECT DISTINCT ON (aset_kode) aset_kode, nilai_buku
       FROM penyusutan ORDER BY aset_kode, tahun DESC
     ) v`
  )).rows[0];
  const assetsWithoutDep = (await query(
    `SELECT COALESCE(SUM(a.nilai_perolehan), 0)::numeric AS total FROM aset a
     WHERE NOT EXISTS (SELECT 1 FROM penyusutan p WHERE p.aset_kode = a.kode)`
  )).rows[0];
  const totalNilaiBuku = Number(nilaiBuku.total) + Number(assetsWithoutDep.total);

  const byKategori = (await query(
    `SELECT k.id, k.nama, COUNT(a.kode)::int AS jumlah, COALESCE(SUM(a.nilai_perolehan), 0)::numeric AS nilai
     FROM kategori k LEFT JOIN aset a ON a.kategori_id = k.id
     GROUP BY k.id, k.nama ORDER BY nilai DESC`
  )).rows;

  const byLokasi = (await query(
    `SELECT l.id, l.nama, l.gedung, COUNT(a.kode)::int AS jumlah, COALESCE(SUM(a.nilai_perolehan), 0)::numeric AS nilai
     FROM lokasi l LEFT JOIN aset a ON a.lokasi_id = l.id
     GROUP BY l.id, l.nama, l.gedung ORDER BY jumlah DESC, nilai DESC LIMIT 10`
  )).rows;

  const trenPeminjaman = (await query(
    `SELECT to_char(date_trunc('month', tgl_pinjam), 'YYYY-MM') AS bulan, COUNT(*)::int AS jumlah
     FROM peminjaman
     WHERE tgl_pinjam >= (CURRENT_DATE - INTERVAL '6 months')
     GROUP BY date_trunc('month', tgl_pinjam)
     ORDER BY bulan`
  )).rows;

  const recentLogs = (await query(
    `SELECT al.*, a.nama AS aset_nama FROM asset_log al
     LEFT JOIN aset a ON a.kode = al.aset_kode
     ORDER BY al.waktu DESC LIMIT 10`
  )).rows;

  const penghapusanPending = (await query(
    `SELECT COUNT(*)::int AS t FROM penghapusan WHERE status = 'Usulan'`
  )).rows[0].t;
  const peminjamanTerlambat = (await query(
    `SELECT COUNT(*)::int AS t FROM peminjaman
     WHERE status = 'Dipinjam' AND tgl_kembali_rencana < CURRENT_DATE`
  )).rows[0].t;
  const servisJatuhTempo = (await query(
    `SELECT COUNT(*)::int AS t FROM servis
     WHERE jenis = 'Preventif' AND jadwal_berikutnya IS NOT NULL
       AND jadwal_berikutnya <= CURRENT_DATE + INTERVAL '7 days'
       AND status <> 'Selesai'`
  )).rows[0].t;

  res.json({
    ok: true,
    data: {
      totals: {
        ...totals,
        total_nilai_buku_sekarang: totalNilaiBuku,
      },
      breakdown_by_kategori: byKategori,
      breakdown_by_lokasi_top10: byLokasi,
      tren_peminjaman: trenPeminjaman,
      recent_asset_log: recentLogs,
      alerts: {
        penghapusan_menunggu_persetujuan: penghapusanPending,
        peminjaman_terlambat: peminjamanTerlambat,
        servis_preventif_jatuh_tempo_7hari: servisJatuhTempo,
      },
    },
  });
}));

module.exports = router;
