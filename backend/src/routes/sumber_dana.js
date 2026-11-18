// Sumber dana routes — funding sources + disposal rules
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);
const writeAuth = authorize('admin', 'petugas');

const schema = z.object({
  nama: z.string().min(1, 'Nama sumber dana wajib diisi').max(80),
  kode: z.string().max(20).optional().nullable(),
  tahun_anggaran: z.coerce.number().int().optional().nullable(),
  ketentuan_penghapusan: z.string().optional().nullable(),
});

// GET /api/sumber-dana
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const search = (req.query.search || req.query.q || '').trim();
  const conditions = [];
  if (search) conditions.push({ sql: '(nama ILIKE ? OR COALESCE(kode,\'\') ILIKE ?)', value: `%${search}%`, repeat: 2 });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    let sql = c.sql;
    for (let i = 0; i < (c.repeat || 1); i++) {
      params.push(c.value);
      sql = sql.replace('?', `$${params.length}`);
    }
    clauses.push('(' + sql + ')');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS t FROM sumber_dana ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT * FROM sumber_dana ${where} ORDER BY nama LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/sumber-dana/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM sumber_dana WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Sumber dana tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/sumber-dana
router.post('/', writeAuth, wrap(async (req, res) => {
  const v = validate(schema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const { rows } = await query(
    `INSERT INTO sumber_dana (nama, kode, tahun_anggaran, ketentuan_penghapusan)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [b.nama, b.kode || null, b.tahun_anggaran || null, b.ketentuan_penghapusan || null]
  );
  await audit(req, 'sumber_dana', rows[0].id, 'CREATE', null, rows[0]);
  res.status(201).json({ ok: true, data: rows[0] });
}));

// PUT /api/sumber-dana/:id
router.put('/:id', writeAuth, wrap(async (req, res) => {
  const v = validate(schema.partial(), req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const before = (await query('SELECT * FROM sumber_dana WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Sumber dana tidak ditemukan');
  const merged = { ...before, ...b };
  const { rows } = await query(
    `UPDATE sumber_dana SET nama=$1, kode=$2, tahun_anggaran=$3, ketentuan_penghapusan=$4
     WHERE id=$5 RETURNING *`,
    [merged.nama, merged.kode || null, merged.tahun_anggaran || null, merged.ketentuan_penghapusan || null, req.params.id]
  );
  await audit(req, 'sumber_dana', req.params.id, 'UPDATE', before, rows[0]);
  res.json({ ok: true, data: rows[0] });
}));

// DELETE /api/sumber-dana/:id — reject if used by assets
router.delete('/:id', writeAuth, wrap(async (req, res) => {
  const before = (await query('SELECT * FROM sumber_dana WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Sumber dana tidak ditemukan');
  const used = (await query('SELECT COUNT(*)::int AS t FROM aset WHERE sumber_dana_id = $1', [req.params.id])).rows[0].t;
  if (used > 0) throw new HttpError(409, `Sumber dana masih dipakai oleh ${used} aset, tidak dapat dihapus`);
  await query('DELETE FROM sumber_dana WHERE id = $1', [req.params.id]);
  await audit(req, 'sumber_dana', req.params.id, 'DELETE', before, null);
  res.json({ ok: true, data: { id: Number(req.params.id) } });
}));

module.exports = router;
