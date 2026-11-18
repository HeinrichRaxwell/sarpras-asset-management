// Peminjaman routes — asset loans with automatic denda on late return
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { authenticate, authorize, audit, assetLog } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);
const writeAuth = authorize('admin', 'petugas');

const DENDA_PER_HARI = 5000;

const createSchema = z.object({
  aset_kode: z.string().min(1, 'Kode aset wajib diisi'),
  peminjam: z.string().min(1, 'Nama peminjam wajib diisi').max(120),
  unit: z.string().max(120).optional().nullable(),
  keperluan: z.string().optional().nullable(),
  tgl_pinjam: z.string().optional(),
  tgl_kembali_rencana: z.string({ message: 'Tanggal rencana kembali wajib diisi' }),
});

// GET /api/peminjaman
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const conditions = [];
  if (req.query.status) conditions.push({ sql: 'p.status = ?', value: String(req.query.status) });
  if (req.query.aset_kode) conditions.push({ sql: 'p.aset_kode = ?', value: String(req.query.aset_kode) });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    params.push(c.value);
    clauses.push('(' + c.sql.replace('?', `$${params.length}`) + ')');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS t FROM peminjaman p ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT p.*, a.nama AS aset_nama FROM peminjaman p
     LEFT JOIN aset a ON a.kode = p.aset_kode
     ${where} ORDER BY p.tgl_pinjam DESC, p.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/peminjaman/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, a.nama AS aset_nama FROM peminjaman p
     LEFT JOIN aset a ON a.kode = p.aset_kode WHERE p.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Peminjaman tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/peminjaman — validates asset is Aktif, sets asset status to Dipinjam
router.post('/', writeAuth, wrap(async (req, res) => {
  const v = validate(createSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;

  const created = await withTransaction(async (client) => {
    const a = await client.query('SELECT * FROM aset WHERE kode = $1 FOR UPDATE', [b.aset_kode]);
    if (!a.rows[0]) throw new HttpError(404, 'Aset tidak ditemukan');
    if (a.rows[0].status !== 'Aktif') throw new HttpError(409, `Aset tidak dapat dipinjam (status: ${a.rows[0].status})`);

    const p = await client.query(
      `INSERT INTO peminjaman (aset_kode, peminjam, unit, keperluan, tgl_pinjam, tgl_kembali_rencana)
       VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6) RETURNING *`,
      [b.aset_kode, b.peminjam, b.unit || null, b.keperluan || null, b.tgl_pinjam || null, b.tgl_kembali_rencana]
    );
    if (p.rows[0].tgl_kembali_rencana < p.rows[0].tgl_pinjam) {
      throw new HttpError(400, 'Tanggal rencana kembali tidak boleh sebelum tanggal pinjam');
    }
    await client.query(`UPDATE aset SET status = 'Dipinjam' WHERE kode = $1`, [b.aset_kode]);
    return p.rows[0];
  });

  await audit(req, 'peminjaman', created.id, 'CREATE', null, created);
  await assetLog(b.aset_kode, 'Dipinjam', req.user.username, { peminjaman_id: created.id, peminjam: b.peminjam });
  res.status(201).json({ ok: true, data: created });
}));

// PATCH /api/peminjaman/:id/return — mark returned, compute late fee, restore asset status
router.patch('/:id/return', writeAuth, wrap(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const p = await client.query('SELECT * FROM peminjaman WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!p.rows[0]) throw new HttpError(404, 'Peminjaman tidak ditemukan');
    if (p.rows[0].status === 'Dikembalikan') throw new HttpError(409, 'Peminjaman ini sudah dikembalikan');

    const now = new Date();
    const aktual = now.toISOString().slice(0, 10);
    const rencana = p.rows[0].tgl_kembali_rencana;
    const daysLate = Math.max(0, Math.floor((now - new Date(rencana)) / (1000 * 60 * 60 * 24)));
    const denda = daysLate * DENDA_PER_HARI;

    // Spec: status becomes 'Dikembalikan' on return; denda records the late penalty
    const updated = await client.query(
      `UPDATE peminjaman SET tgl_kembali_aktual = $1, status = 'Dikembalikan', denda = $2 WHERE id = $3 RETURNING *`,
      [aktual, denda, req.params.id]
    );
    await client.query(`UPDATE aset SET status = 'Aktif' WHERE kode = $1`, [p.rows[0].aset_kode]);
    return { peminjaman: updated.rows[0], daysLate, denda };
  });

  await audit(req, 'peminjaman', req.params.id, 'UPDATE', null, result.peminjaman);
  await assetLog(result.peminjaman.aset_kode, 'Dikembalikan', req.user.username,
    { peminjaman_id: result.peminjaman.id, denda: result.denda, hari_terlambat: result.daysLate });
  res.json({ ok: true, data: result.peminjaman, denda: result.denda, hari_terlambat: result.daysLate });
}));

module.exports = router;
