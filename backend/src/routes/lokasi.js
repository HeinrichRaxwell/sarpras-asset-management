// Lokasi routes — hierarchical location tree (Gedung > Lantai > Ruang)
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);
const writeAuth = authorize('admin', 'petugas');

const schema = z.object({
  nama: z.string().min(1, 'Nama lokasi wajib diisi').max(120),
  gedung: z.string().max(80).optional().nullable(),
  lantai: z.string().max(20).optional().nullable(),
  penanggung_jawab: z.string().max(100).optional().nullable(),
  parent_id: z.coerce.number().int().positive().optional().nullable(),
});

// GET /api/lokasi — flat list; ?parent_id= filters children (use ?parent_id=null for roots)
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query, 100);
  const search = (req.query.search || req.query.q || '').trim();
  const conditions = [];
  if (req.query.parent_id !== undefined) {
    if (req.query.parent_id === '' || req.query.parent_id === 'null') {
      conditions.push({ sql: 'parent_id IS NULL', value: null });
    } else {
      conditions.push({ sql: 'parent_id = ?', value: Number(req.query.parent_id) });
    }
  }
  if (search) conditions.push({ sql: 'nama ILIKE ?', value: `%${search}%` });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    if (c.value === null) { clauses.push('(' + c.sql + ')'); continue; }
    params.push(c.value);
    clauses.push('(' + c.sql.replace('?', `$${params.length}`) + ')');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS t FROM lokasi ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT l.*, p.nama AS parent_nama FROM lokasi l
     LEFT JOIN lokasi p ON p.id = l.parent_id
     ${where} ORDER BY l.nama LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/lokasi/tree — nested hierarchy
router.get('/tree', wrap(async (_req, res) => {
  const { rows } = await query('SELECT * FROM lokasi ORDER BY nama');
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
  const tree = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
    else tree.push(node);
  }
  res.json({ ok: true, data: tree });
}));

// GET /api/lokasi/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT l.*, p.nama AS parent_nama FROM lokasi l
     LEFT JOIN lokasi p ON p.id = l.parent_id WHERE l.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Lokasi tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/lokasi
router.post('/', writeAuth, wrap(async (req, res) => {
  const v = validate(schema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  if (b.parent_id) {
    const p = await query('SELECT id FROM lokasi WHERE id = $1', [b.parent_id]);
    if (!p.rows[0]) throw new HttpError(400, 'Lokasi induk tidak ditemukan');
  }
  const { rows } = await query(
    `INSERT INTO lokasi (nama, gedung, lantai, penanggung_jawab, parent_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.nama, b.gedung || null, b.lantai || null, b.penanggung_jawab || null, b.parent_id || null]
  );
  await audit(req, 'lokasi', rows[0].id, 'CREATE', null, rows[0]);
  res.status(201).json({ ok: true, data: rows[0] });
}));

// PUT /api/lokasi/:id
router.put('/:id', writeAuth, wrap(async (req, res) => {
  const v = validate(schema.partial(), req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const before = (await query('SELECT * FROM lokasi WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Lokasi tidak ditemukan');
  const merged = { ...before, ...b };
  if (merged.parent_id && Number(merged.parent_id) === Number(req.params.id)) {
    throw new HttpError(400, 'Lokasi tidak boleh menjadi induk dirinya sendiri');
  }
  if (merged.parent_id) {
    const p = await query('SELECT id FROM lokasi WHERE id = $1', [merged.parent_id]);
    if (!p.rows[0]) throw new HttpError(400, 'Lokasi induk tidak ditemukan');
  }
  const { rows } = await query(
    `UPDATE lokasi SET nama=$1, gedung=$2, lantai=$3, penanggung_jawab=$4, parent_id=$5
     WHERE id=$6 RETURNING *`,
    [merged.nama, merged.gedung || null, merged.lantai || null, merged.penanggung_jawab || null,
     merged.parent_id || null, req.params.id]
  );
  await audit(req, 'lokasi', req.params.id, 'UPDATE', before, rows[0]);
  res.json({ ok: true, data: rows[0] });
}));

// DELETE /api/lokasi/:id — reject if used by assets or has children
router.delete('/:id', writeAuth, wrap(async (req, res) => {
  const before = (await query('SELECT * FROM lokasi WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Lokasi tidak ditemukan');
  const used = (await query('SELECT COUNT(*)::int AS t FROM aset WHERE lokasi_id = $1', [req.params.id])).rows[0].t;
  if (used > 0) throw new HttpError(409, `Lokasi masih dipakai oleh ${used} aset, tidak dapat dihapus`);
  const child = (await query('SELECT COUNT(*)::int AS t FROM lokasi WHERE parent_id = $1', [req.params.id])).rows[0].t;
  if (child > 0) throw new HttpError(409, 'Lokasi masih memiliki sub-lokasi, hapus anak terlebih dahulu');
  await query('DELETE FROM lokasi WHERE id = $1', [req.params.id]);
  await audit(req, 'lokasi', req.params.id, 'DELETE', before, null);
  res.json({ ok: true, data: { id: Number(req.params.id) } });
}));

module.exports = router;
