// Verifikasi routes — stock opname sessions + physical reconciliation items
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);
const writeAuth = authorize('admin', 'petugas');

const sessionSchema = z.object({
  kode: z.string().min(1, 'Kode sesi wajib diisi').max(30),
  nama: z.string().min(1, 'Nama sesi wajib diisi').max(150),
  tanggal_mulai: z.string().optional(),
});

const itemSchema = z.object({
  aset_kode: z.string().min(1, 'Kode aset wajib diisi'),
  ditemukan: z.boolean({ message: 'ditemukan wajib boolean' }).optional(),
  kondisi_fisik: z.enum(['Baik', 'Rusak Ringan', 'Rusak Berat']).optional().nullable(),
  lokasi_temuan_id: z.coerce.number().int().positive().optional().nullable(),
  catatan: z.string().optional().nullable(),
});

// GET /api/verifikasi
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const conditions = [];
  if (req.query.status) conditions.push({ sql: 'status = ?', value: String(req.query.status) });
  const search = (req.query.search || req.query.q || '').trim();
  if (search) conditions.push({ sql: '(nama ILIKE ? OR kode ILIKE ?)', value: `%${search}%`, repeat: 2 });

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
  const total = (await query(`SELECT COUNT(*)::int AS t FROM verifikasi ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT v.*, u.nama AS dijalankan_oleh_nama,
            (SELECT COUNT(*)::int FROM opname_item oi WHERE oi.verifikasi_id = v.id) AS jumlah_item
     FROM verifikasi v LEFT JOIN users u ON u.id = v.dijalankan_oleh
     ${where} ORDER BY v.tanggal_mulai DESC, v.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/verifikasi/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT v.*, u.nama AS dijalankan_oleh_nama FROM verifikasi v
     LEFT JOIN users u ON u.id = v.dijalankan_oleh WHERE v.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/verifikasi
router.post('/', writeAuth, wrap(async (req, res) => {
  const v = validate(sessionSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const { rows } = await query(
    `INSERT INTO verifikasi (kode, nama, tanggal_mulai, dijalankan_oleh)
     VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4) RETURNING *`,
    [b.kode, b.nama, b.tanggal_mulai || null, req.user.id]
  );
  await audit(req, 'verifikasi', rows[0].id, 'CREATE', null, rows[0]);
  res.status(201).json({ ok: true, data: rows[0] });
}));

// PUT /api/verifikasi/:id
router.put('/:id', writeAuth, wrap(async (req, res) => {
  const v = validate(sessionSchema.partial(), req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const before = (await query('SELECT * FROM verifikasi WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
  const merged = { ...before, ...b };
  if (before.status === 'Selesai') throw new HttpError(409, 'Sesi sudah ditutup, tidak dapat diubah');
  const { rows } = await query(
    `UPDATE verifikasi SET kode=$1, nama=$2, tanggal_mulai=$3 WHERE id=$4 RETURNING *`,
    [merged.kode, merged.nama, merged.tanggal_mulai, req.params.id]
  );
  await audit(req, 'verifikasi', req.params.id, 'UPDATE', before, rows[0]);
  res.json({ ok: true, data: rows[0] });
}));

// DELETE /api/verifikasi/:id
router.delete('/:id', writeAuth, wrap(async (req, res) => {
  const before = (await query('SELECT * FROM verifikasi WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
  await query('DELETE FROM verifikasi WHERE id = $1', [req.params.id]);
  await audit(req, 'verifikasi', req.params.id, 'DELETE', before, null);
  res.json({ ok: true, data: { id: Number(req.params.id) } });
}));

// POST /api/verifikasi/:id/items — record opname result for one asset (upsert per session)
router.post('/:id/items', writeAuth, wrap(async (req, res) => {
  const v = validate(itemSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const session = (await query('SELECT * FROM verifikasi WHERE id = $1', [req.params.id])).rows[0];
  if (!session) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
  if (session.status === 'Selesai') throw new HttpError(409, 'Sesi sudah ditutup');
  const asset = (await query('SELECT kode FROM aset WHERE kode = $1', [b.aset_kode])).rows[0];
  if (!asset) throw new HttpError(404, 'Aset tidak ditemukan');

  const { rows } = await query(
    `INSERT INTO opname_item (verifikasi_id, aset_kode, ditemukan, kondisi_fisik, lokasi_temuan_id, catatan)
     VALUES ($1,$2,COALESCE($3, TRUE),$4,$5,$6)
     ON CONFLICT (verifikasi_id, aset_kode) DO UPDATE
     SET ditemukan = EXCLUDED.ditemukan, kondisi_fisik = EXCLUDED.kondisi_fisik,
         lokasi_temuan_id = EXCLUDED.lokasi_temuan_id, catatan = EXCLUDED.catatan
     RETURNING *`,
    [req.params.id, b.aset_kode, b.ditemukan ?? true, b.kondisi_fisik || null,
     b.lokasi_temuan_id || null, b.catatan || null]
  );
  await audit(req, 'opname_item', rows[0].id, 'CREATE', null, rows[0]);
  res.status(201).json({ ok: true, data: rows[0] });
}));

// PATCH /api/verifikasi/:id/finish — close the session
router.patch('/:id/finish', writeAuth, wrap(async (req, res) => {
  const before = (await query('SELECT * FROM verifikasi WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
  if (before.status === 'Selesai') throw new HttpError(409, 'Sesi sudah ditutup sebelumnya');
  const { rows } = await query(
    `UPDATE verifikasi SET status = 'Selesai', tanggal_selesai = CURRENT_DATE WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  await audit(req, 'verifikasi', req.params.id, 'UPDATE', before, rows[0]);
  res.json({ ok: true, data: rows[0] });
}));

// GET /api/verifikasi/:id/summary — reconciliation counts
router.get('/:id/summary', wrap(async (req, res) => {
  const session = (await query('SELECT * FROM verifikasi WHERE id = $1', [req.params.id])).rows[0];
  if (!session) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
  const counts = (await query(
    `SELECT
       COUNT(*)::int AS total_dicatat,
       COUNT(*) FILTER (WHERE ditemukan = TRUE)::int AS ditemukan,
       COUNT(*) FILTER (WHERE ditemukan = FALSE)::int AS tidak_ditemukan
     FROM opname_item WHERE verifikasi_id = $1`,
    [req.params.id]
  )).rows[0];
  const totalAset = (await query(
    "SELECT COUNT(*)::int AS t FROM aset WHERE status <> 'Dihapus'"
  )).rows[0].t;
  res.json({
    ok: true,
    data: {
      sesi: session,
      total_aset_aktif: totalAset,
      ...counts,
      belum_dicatat: Math.max(0, totalAset - counts.total_dicatat),
    },
  });
}));

// GET /api/verifikasi/:id/items — list opname items in a session
router.get('/:id/items', wrap(async (req, res) => {
  const session = (await query('SELECT id FROM verifikasi WHERE id = $1', [req.params.id])).rows[0];
  if (!session) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
  const { rows } = await query(
    `SELECT oi.*, a.nama AS aset_nama, l.nama AS lokasi_temuan FROM opname_item oi
     LEFT JOIN aset a ON a.kode = oi.aset_kode
     LEFT JOIN lokasi l ON l.id = oi.lokasi_temuan_id
     WHERE oi.verifikasi_id = $1 ORDER BY oi.aset_kode`,
    [req.params.id]
  );
  res.json({ ok: true, data: rows });
}));

module.exports = router;
