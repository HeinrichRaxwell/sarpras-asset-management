// Dokumen routes — per-asset attachments (URL-based)
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { validate, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);
const writeAuth = authorize('admin', 'petugas');

const JENIS = ['Faktur', 'BAST', 'Kwitansi', 'Garansi', 'Lainnya'];

const schema = z.object({
  jenis: z.enum(JENIS, { message: 'Jenis dokumen tidak valid' }),
  nama_file: z.string().min(1, 'Nama file wajib diisi').max(255),
  url: z.string().min(1, 'URL wajib diisi').max(2000),
});

// GET /api/dokumen/:asetKode
router.get('/:asetKode', wrap(async (req, res) => {
  const asset = (await query('SELECT kode FROM aset WHERE kode = $1', [req.params.asetKode])).rows[0];
  if (!asset) throw new HttpError(404, 'Aset tidak ditemukan');
  const { rows } = await query(
    `SELECT d.*, u.nama AS diunggah_oleh_nama FROM dokumen d
     LEFT JOIN users u ON u.id = d.diunggah_oleh
     WHERE d.aset_kode = $1 ORDER BY d.unggah_pada DESC`,
    [req.params.asetKode]
  );
  res.json({ ok: true, data: rows });
}));

// POST /api/dokumen/:asetKode
router.post('/:asetKode', writeAuth, wrap(async (req, res) => {
  const v = validate(schema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const asset = (await query('SELECT kode FROM aset WHERE kode = $1', [req.params.asetKode])).rows[0];
  if (!asset) throw new HttpError(404, 'Aset tidak ditemukan');

  const { rows } = await query(
    `INSERT INTO dokumen (aset_kode, jenis, nama_file, url, diunggah_oleh)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.asetKode, b.jenis, b.nama_file, b.url, req.user.id]
  );
  await audit(req, 'dokumen', rows[0].id, 'CREATE', null, rows[0]);
  res.status(201).json({ ok: true, data: rows[0] });
}));

// DELETE /api/dokumen/:id
router.delete('/:id', writeAuth, wrap(async (req, res) => {
  const before = (await query('SELECT * FROM dokumen WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Dokumen tidak ditemukan');
  await query('DELETE FROM dokumen WHERE id = $1', [req.params.id]);
  await audit(req, 'dokumen', req.params.id, 'DELETE', before, null);
  res.json({ ok: true, data: { id: Number(req.params.id) } });
}));

module.exports = router;
