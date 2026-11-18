// Kartu Inventaris Ruang (KIR) — grouped asset list per room + CSV export
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);

// GET /api/kir/:lokasiId?year=YYYY&format=csv
router.get('/:lokasiId', wrap(async (req, res) => {
  const lokasiId = Number(req.params.lokasiId);
  if (!Number.isInteger(lokasiId) || lokasiId <= 0) throw new HttpError(400, 'ID lokasi tidak valid');
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();

  const lokasi = (await query('SELECT * FROM lokasi WHERE id = $1', [lokasiId])).rows[0];
  if (!lokasi) throw new HttpError(404, 'Lokasi tidak ditemukan');

  const { rows } = await query(
    `SELECT kode, nama, merk, tipe,
            EXTRACT(YEAR FROM tanggal_perolehan)::int AS tahun,
            1 AS jumlah,
            nilai_perolehan AS nilai,
            kondisi, status,
            CASE
              WHEN kategori_id IS NOT NULL THEN (SELECT nama FROM kategori WHERE id = aset.kategori_id)
              ELSE NULL
            END AS kategori,
            CASE
              WHEN kondisi <> 'Baik' THEN 'Kondisi: ' || kondisi
              WHEN status <> 'Aktif' THEN 'Status: ' || status
              ELSE NULL
            END AS keterangan
     FROM aset
     WHERE lokasi_id = $1 AND status <> 'Dihapus'
       AND EXTRACT(YEAR FROM tanggal_perolehan)::int = $2
     ORDER BY kategori, kode`,
    [lokasiId, year]
  );

  if (req.query.format === 'csv') {
    const header = ['Kode', 'Nama', 'Merk', 'Tipe', 'Tahun', 'Jumlah', 'Nilai', 'Kategori', 'Keterangan'];
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.kode, r.nama, r.merk, r.tipe, r.tahun, r.jumlah, r.nilai, r.kategori, r.keterangan].map(esc).join(','));
    }
    const fileName = `KIR_${lokasi.nama.replace(/[^\w\-]+/g, '_')}_${year}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send('\ufeff' + lines.join('\r\n'));
  }

  res.json({
    ok: true,
    data: {
      lokasi,
      tahun: year,
      items: rows,
      total_jumlah: rows.reduce((s, r) => s + Number(r.jumlah), 0),
      total_nilai: rows.reduce((s, r) => s + Number(r.nilai || 0), 0),
    },
  });
}));

module.exports = router;
