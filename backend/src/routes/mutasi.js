// Mutasi routes — inter-room asset transfers with BAST
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { authenticate, authorize, audit, assetLog } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);
const writeAuth = authorize('admin', 'petugas');

const createSchema = z.object({
  aset_kode: z.string().min(1, 'Kode aset wajib diisi'),
  lokasi_tujuan_id: z.coerce.number().int().positive('Lokasi tujuan wajib dipilih'),
  tanggal: z.string().optional(),
  alasan: z.string().optional().nullable(),
  no_bast: z.string().max(50).optional().nullable(),
  disetujui_oleh: z.coerce.number().int().positive().optional().nullable(),
});

// GET /api/mutasi
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const conditions = [];
  if (req.query.aset_kode) conditions.push({ sql: 'm.aset_kode = ?', value: String(req.query.aset_kode) });
  if (req.query.lokasi_tujuan_id) conditions.push({ sql: 'm.lokasi_tujuan_id = ?', value: Number(req.query.lokasi_tujuan_id) });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    params.push(c.value);
    clauses.push('(' + c.sql.replace('?', `$${params.length}`) + ')');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS t FROM mutasi m ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT m.*, a.nama AS aset_nama, la.nama AS lokasi_asal, lt.nama AS lokasi_tujuan
     FROM mutasi m
     LEFT JOIN aset a ON a.kode = m.aset_kode
     LEFT JOIN lokasi la ON la.id = m.lokasi_asal_id
     LEFT JOIN lokasi lt ON lt.id = m.lokasi_tujuan_id
     ${where} ORDER BY m.tanggal DESC, m.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/mutasi/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT m.*, a.nama AS aset_nama, la.nama AS lokasi_asal, lt.nama AS lokasi_tujuan
     FROM mutasi m
     LEFT JOIN aset a ON a.kode = m.aset_kode
     LEFT JOIN lokasi la ON la.id = m.lokasi_asal_id
     LEFT JOIN lokasi lt ON lt.id = m.lokasi_tujuan_id
     WHERE m.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Mutasi tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/mutasi — validates asset, records mutasi, updates asset lokasi
router.post('/', writeAuth, wrap(async (req, res) => {
  const v = validate(createSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;

  const tujuan = await query('SELECT id FROM lokasi WHERE id = $1', [b.lokasi_tujuan_id]);
  if (!tujuan.rows[0]) throw new HttpError(400, 'Lokasi tujuan tidak ditemukan');

  const created = await withTransaction(async (client) => {
    const a = await client.query('SELECT * FROM aset WHERE kode = $1 FOR UPDATE', [b.aset_kode]);
    if (!a.rows[0]) throw new HttpError(404, 'Aset tidak ditemukan');

    const m = await client.query(
      `INSERT INTO mutasi (aset_kode, lokasi_asal_id, lokasi_tujuan_id, tanggal, alasan, no_bast, disetujui_oleh)
       VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7) RETURNING *`,
      [b.aset_kode, a.rows[0].lokasi_id || null, b.lokasi_tujuan_id, b.tanggal || null,
       b.alasan || null, b.no_bast || null, b.disetujui_oleh || null]
    );
    await client.query(`UPDATE aset SET lokasi_id = $1 WHERE kode = $2`, [b.lokasi_tujuan_id, b.aset_kode]);
    return m.rows[0];
  });

  await audit(req, 'mutasi', created.id, 'CREATE', null, created);
  await assetLog(b.aset_kode, 'Mutasi', req.user.username,
    { mutasi_id: created.id, lokasi_tujuan_id: b.lokasi_tujuan_id, no_bast: created.no_bast });
  res.status(201).json({ ok: true, data: created });
}));

module.exports = router;
