// Penyusutan routes — annual depreciation computation (Garis Lurus / Saldo Menurun)
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { validate, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);

const computeSchema = z.object({
  tahun: z.coerce.number().int().min(2000).max(2100, 'Tahun tidak valid'),
  metode: z.enum(['Garis Lurus', 'Saldo Menurun']).optional(),
});

// GET /api/penyusutan?year=YYYY — list all depreciation rows for a year
router.get('/', wrap(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const { rows } = await query(
    `SELECT p.*, a.nama AS aset_nama, k.nama AS kategori_nama
     FROM penyusutan p
     LEFT JOIN aset a ON a.kode = p.aset_kode
     LEFT JOIN kategori k ON k.id = a.kategori_id
     WHERE p.tahun = $1 ORDER BY p.aset_kode`,
    [year]
  );
  res.json({ ok: true, data: rows, meta: { tahun: year, total: rows.length } });
}));

// GET /api/penyusutan/:kode — full depreciation schedule for one asset
router.get('/:kode', wrap(async (req, res) => {
  const asset = (await query('SELECT * FROM aset WHERE kode = $1', [req.params.kode])).rows[0];
  if (!asset) throw new HttpError(404, 'Aset tidak ditemukan');
  const kategori = (await query('SELECT * FROM kategori WHERE id = $1', [asset.kategori_id])).rows[0];
  const { rows } = await query(
    'SELECT * FROM penyusutan WHERE aset_kode = $1 ORDER BY tahun ASC',
    [req.params.kode]
  );
  res.json({
    ok: true,
    data: {
      aset: asset,
      kategori,
      umur_ekonomis_tahun: kategori?.umur_ekonomis_tahun || 5,
      jadwal: rows,
    },
  });
}));

// POST /api/penyusutan/compute — compute & upsert for a year across all active assets
router.post('/compute', authorize('admin', 'petugas'), wrap(async (req, res) => {
  const v = validate(computeSchema, req.body, res);
  if (!v.ok) return;
  const { tahun, metode } = v.value;

  const assets = (await query(
    `SELECT a.*, k.umur_ekonomis_tahun, k.persen_penyusutan
     FROM aset a LEFT JOIN kategori k ON k.id = a.kategori_id
     WHERE a.status = 'Aktif'`
  )).rows;

  const results = await withTransaction(async (client) => {
    const out = [];
    for (const a of assets) {
      const method = metode || 'Garis Lurus';
      const rate = Number(a.persen_penyusutan || 20) / 100;

      // Prior cumulative from previous year
      const prev = (await client.query(
        'SELECT akumulasi FROM penyusutan WHERE aset_kode = $1 AND tahun = $2',
        [a.kode, tahun - 1]
      )).rows[0];
      const akumulasiSebelumnya = Number(prev?.akumulasi || 0);
      const nilaiAwal = Number(a.nilai_perolehan || 0);

      let beban;
      if (method === 'Saldo Menurun') {
        beban = Math.max(0, (nilaiAwal - akumulasiSebelumnya) * rate);
      } else {
        beban = nilaiAwal * rate;
      }
      const akumulasi = Math.min(nilaiAwal, akumulasiSebelumnya + beban);
      const nilaiBuku = Math.max(0, nilaiAwal - akumulasi);

      // Stop depreciating when fully depreciated or past useful life
      const tahunPerolehan = new Date(a.tanggal_perolehan).getFullYear();
      const tahunKe = tahun - tahunPerolehan + 1;
      if (tahunKe <= 0 || (method === 'Garis Lurus' && tahunKe > a.umur_ekonomis_tahun)) {
        continue;
      }

      const r = await client.query(
        `INSERT INTO penyusutan (aset_kode, tahun, metode, nilai_awal, beban_tahunan, akumulasi, nilai_buku)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (aset_kode, tahun) DO UPDATE
         SET metode = EXCLUDED.metode, nilai_awal = EXCLUDED.nilai_awal,
             beban_tahunan = EXCLUDED.beban_tahunan, akumulasi = EXCLUDED.akumulasi,
             nilai_buku = EXCLUDED.nilai_buku
         RETURNING *`,
        [a.kode, tahun, method, nilaiAwal, beban.toFixed(2), akumulasi.toFixed(2), nilaiBuku.toFixed(2)]
      );
      out.push(r.rows[0]);
    }
    return out;
  });

  await audit(req, 'penyusutan', String(tahun), 'CREATE', null, { tahun, jumlah: results.length });
  res.json({ ok: true, data: results, meta: { tahun, jumlah_dihitung: results.length } });
}));

module.exports = router;
