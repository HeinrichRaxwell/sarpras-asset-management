// Penghapusan routes — asset disposal proposals (Musnah / Lelang / Hibah)
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
  metode: z.enum(['Musnah', 'Lelang', 'Hibah'], { message: 'Metode penghapusan tidak valid' }),
  tanggal: z.string().optional(),
  nilai_buku: z.coerce.number().min(0).optional(),
  nilai_lelang: z.coerce.number().min(0).optional().nullable(),
  alasan: z.string().optional().nullable(),
});

// GET /api/penghapusan
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const conditions = [];
  if (req.query.status) conditions.push({ sql: 'p.status = ?', value: String(req.query.status) });
  if (req.query.metode) conditions.push({ sql: 'p.metode = ?', value: String(req.query.metode) });
  if (req.query.aset_kode) conditions.push({ sql: 'p.aset_kode = ?', value: String(req.query.aset_kode) });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    params.push(c.value);
    clauses.push('(' + c.sql.replace('?', `$${params.length}`) + ')');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS t FROM penghapusan p ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT p.*, a.nama AS aset_nama, a.lokasi_id AS aset_lokasi_id FROM penghapusan p
     LEFT JOIN aset a ON a.kode = p.aset_kode
     ${where} ORDER BY p.tanggal DESC, p.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/penghapusan/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, a.nama AS aset_nama FROM penghapusan p
     LEFT JOIN aset a ON a.kode = p.aset_kode WHERE p.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Penghapusan tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/penghapusan — file a disposal proposal
router.post('/', writeAuth, wrap(async (req, res) => {
  const v = validate(createSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;

  const asset = (await query('SELECT * FROM aset WHERE kode = $1', [b.aset_kode])).rows[0];
  if (!asset) throw new HttpError(404, 'Aset tidak ditemukan');

  const sumberDana = asset.sumber_dana_id
    ? (await query('SELECT * FROM sumber_dana WHERE id = $1', [asset.sumber_dana_id])).rows[0]
    : null;

  const { rows } = await query(
    `INSERT INTO penghapusan (aset_kode, metode, tanggal, nilai_buku, nilai_lelang, alasan)
     VALUES ($1,$2,COALESCE($3, CURRENT_DATE),COALESCE($4,$5),$6,$7) RETURNING *`,
    [b.aset_kode, b.metode, b.tanggal || null, b.nilai_buku || null, asset.nilai_perolehan || 0,
     b.nilai_lelang || null, b.alasan || null]
  );

  await audit(req, 'penghapusan', rows[0].id, 'CREATE', null, rows[0]);
  await assetLog(b.aset_kode, 'Usulan Penghapusan', req.user.username, { penghapusan_id: rows[0].id, metode: b.metode });
  res.status(201).json({
    ok: true,
    data: rows[0],
    ketentuan_penghapusan: sumberDana?.ketentuan_penghapusan || null,
    message: sumberDana?.ketentuan_penghapusan
      ? `Catatan: ${sumberDana.ketentuan_penghapusan}`
      : null,
  });
}));

// PATCH /api/penghapusan/:id/approve — pimpinan/admin only; soft-deletes the asset
router.patch('/:id/approve', authorize('admin', 'pimpinan'), wrap(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const p = await client.query('SELECT * FROM penghapusan WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!p.rows[0]) throw new HttpError(404, 'Penghapusan tidak ditemukan');
    if (p.rows[0].status !== 'Usulan') throw new HttpError(409, `Usulan sudah diproses (status: ${p.rows[0].status})`);

    const updated = await client.query(
      `UPDATE penghapusan SET status = 'Disetujui', disetujui_oleh = $1 WHERE id = $2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    await client.query(
      `UPDATE aset SET status = 'Dihapus', lokasi_id = NULL WHERE kode = $1`,
      [p.rows[0].aset_kode]
    );
    return { penghapusan: updated.rows[0], aset_kode: p.rows[0].aset_kode };
  });

  // sumber_dana_id remains on the asset after disposal (only status & lokasi change)
  const asset = (await query('SELECT sumber_dana_id FROM aset WHERE kode = $1', [result.aset_kode])).rows[0];
  const sumberDana = asset?.sumber_dana_id
    ? (await query('SELECT ketentuan_penghapusan FROM sumber_dana WHERE id = $1', [result.sumber_dana_id])).rows[0]
    : null;

  await audit(req, 'penghapusan', req.params.id, 'UPDATE', null, result.penghapusan);
  await assetLog(result.aset_kode, 'Penghapusan Disetujui', req.user.username, { penghapusan_id: Number(req.params.id) });
  res.json({
    ok: true,
    data: result.penghapusan,
    ketentuan_penghapusan: sumberDana?.ketentuan_penghapusan || null,
  });
}));

module.exports = router;
