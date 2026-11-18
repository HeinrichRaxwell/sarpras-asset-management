// Kategori routes — asset categories + depreciation rules
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);
const writeAuth = authorize('admin', 'petugas');

const schema = z.object({
  nama: z.string().min(1, 'Nama kategori wajib diisi').max(100),
  deskripsi: z.string().optional().nullable(),
  umur_ekonomis_tahun: z.coerce.number().int().positive('Umur ekonomis harus > 0').optional(),
  persen_penyusutan: z.coerce.number().positive('Persen penyusutan harus > 0').max(100, 'Persen penyusutan maksimal 100').optional(),
  akun_penyusutan: z.string().max(20).optional().nullable(),
});

// GET /api/kategori
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const search = (req.query.search || req.query.q || '').trim();
  const conditions = [];
  if (search) conditions.push({ sql: 'nama ILIKE ?', value: `%${search}%` });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    params.push(c.value);
    clauses.push(c.sql.replace('?', `$${params.length}`));
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS t FROM kategori ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT * FROM kategori ${where} ORDER BY nama LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/kategori/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM kategori WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Kategori tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/kategori
router.post('/', writeAuth, wrap(async (req, res) => {
  const v = validate(schema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const { rows } = await query(
    `INSERT INTO kategori (nama, deskripsi, umur_ekonomis_tahun, persen_penyusutan, akun_penyusutan)
     VALUES ($1,$2,COALESCE($3,5),COALESCE($4,20.00),$5) RETURNING *`,
    [b.nama, b.deskripsi || null, b.umur_ekonomis_tahun || null, b.persen_penyusutan || null, b.akun_penyusutan || null]
  );
  await audit(req, 'kategori', rows[0].id, 'CREATE', null, rows[0]);
  res.status(201).json({ ok: true, data: rows[0] });
}));

// PUT /api/kategori/:id
router.put('/:id', writeAuth, wrap(async (req, res) => {
  const v = validate(schema.partial(), req.body, res);
  if (!v.ok) return;
  const before = (await query('SELECT * FROM kategori WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Kategori tidak ditemukan');
  const merged = { ...before, ...v.value };
  const { rows } = await query(
    `UPDATE kategori SET nama=$1, deskripsi=$2, umur_ekonomis_tahun=$3, persen_penyusutan=$4, akun_penyusutan=$5
     WHERE id=$6 RETURNING *`,
    [merged.nama, merged.deskripsi || null, merged.umur_ekonomis_tahun, merged.persen_penyusutan,
     merged.akun_penyusutan || null, req.params.id]
  );
  await audit(req, 'kategori', req.params.id, 'UPDATE', before, rows[0]);
  res.json({ ok: true, data: rows[0] });
}));

// DELETE /api/kategori/:id — reject if kategori still has assets
router.delete('/:id', writeAuth, wrap(async (req, res) => {
  const before = (await query('SELECT * FROM kategori WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Kategori tidak ditemukan');
  const used = (await query('SELECT COUNT(*)::int AS t FROM aset WHERE kategori_id = $1', [req.params.id])).rows[0].t;
  if (used > 0) throw new HttpError(409, `Kategori masih dipakai oleh ${used} aset, tidak dapat dihapus`);
  await query('DELETE FROM kategori WHERE id = $1', [req.params.id]);
  await audit(req, 'kategori', req.params.id, 'DELETE', before, null);
  res.json({ ok: true, data: { id: Number(req.params.id) } });
}));

module.exports = router;
