import { Hono } from 'hono';

export function dashboardRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);

  r.get('/', async (c) => {
    const totals = (await db.query(
      `SELECT
         COUNT(*) AS total_aset,
         COALESCE(SUM(nilai_perolehan), 0) AS total_nilai_perolehan,
         SUM(CASE WHEN status = 'Dipinjam' THEN 1 ELSE 0 END) AS jumlah_dipinjam,
         SUM(CASE WHEN status = 'Servis' THEN 1 ELSE 0 END) AS jumlah_servis,
         SUM(CASE WHEN kondisi IN ('Rusak Ringan','Rusak Berat') THEN 1 ELSE 0 END) AS jumlah_rusak
       FROM aset`
    )).rows[0];

    // DISTINCT ON tidak ada di SQLite; ROW_NUMBER() per aset_kode memberi
    // baris tahun terbaru yang sama.
    const nilaiBuku = (await db.query(
      `SELECT COALESCE(SUM(v.nilai_buku), 0) AS total FROM (
         SELECT aset_kode, nilai_buku,
                ROW_NUMBER() OVER (PARTITION BY aset_kode ORDER BY tahun DESC) AS rn
         FROM penyusutan
       ) v WHERE v.rn = 1`
    )).rows[0];

    const assetsWithoutDep = (await db.query(
      `SELECT COALESCE(SUM(a.nilai_perolehan), 0) AS total FROM aset a
       WHERE NOT EXISTS (SELECT 1 FROM penyusutan p WHERE p.aset_kode = a.kode)`
    )).rows[0];
    const totalNilaiBuku = Number(nilaiBuku.total) + Number(assetsWithoutDep.total);

    const byKategori = (await db.query(
      `SELECT k.id, k.nama, COUNT(a.kode) AS jumlah, COALESCE(SUM(a.nilai_perolehan), 0) AS nilai
       FROM kategori k LEFT JOIN aset a ON a.kategori_id = k.id
       GROUP BY k.id, k.nama ORDER BY nilai DESC`
    )).rows;

    const byLokasi = (await db.query(
      `SELECT l.id, l.nama, l.gedung, COUNT(a.kode) AS jumlah, COALESCE(SUM(a.nilai_perolehan), 0) AS nilai
       FROM lokasi l LEFT JOIN aset a ON a.lokasi_id = l.id
       GROUP BY l.id, l.nama, l.gedung ORDER BY jumlah DESC, nilai DESC LIMIT 10`
    )).rows;

    const trenPeminjaman = (await db.query(
      `SELECT strftime('%Y-%m', tgl_pinjam) AS bulan, COUNT(*) AS jumlah
       FROM peminjaman
       WHERE tgl_pinjam >= date('now', '-6 month')
       GROUP BY strftime('%Y-%m', tgl_pinjam)
       ORDER BY bulan`
    )).rows;

    const recentLogs = (await db.query(
      `SELECT al.*, a.nama AS aset_nama FROM asset_log al
       LEFT JOIN aset a ON a.kode = al.aset_kode
       ORDER BY al.waktu DESC LIMIT 10`
    )).rows;

    const penghapusanPending = (await db.query(
      `SELECT COUNT(*) AS t FROM penghapusan WHERE status = 'Usulan'`
    )).rows[0].t;
    const peminjamanTerlambat = (await db.query(
      `SELECT COUNT(*) AS t FROM peminjaman
       WHERE status = 'Dipinjam' AND tgl_kembali_rencana < date('now')`
    )).rows[0].t;
    const servisJatuhTempo = (await db.query(
      `SELECT COUNT(*) AS t FROM servis
       WHERE jenis = 'Preventif' AND jadwal_berikutnya IS NOT NULL
         AND jadwal_berikutnya <= date('now', '+7 day')
         AND status <> 'Selesai'`
    )).rows[0].t;

    return c.json({
      ok: true,
      data: {
        totals: { ...totals, total_nilai_buku_sekarang: totalNilaiBuku },
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
  });

  return r;
}