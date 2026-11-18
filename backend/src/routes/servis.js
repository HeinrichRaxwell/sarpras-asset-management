// Servis routes — corrective (Kuratif) & preventive (Preventif) maintenance
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { authenticate, authorize, audit, assetLog } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);
const writeAuth = authorize('admin', 'petugas');

const JENIS = ['Kuratif', 'Preventif'];
const STATUS = ['Antri', 'Proses', 'Selesai'];
const KONDISI = ['Baik', 'Rusak Ringan', 'Rusak Berat'];

const createSchema = z.object({
  aset_kode: z.string().min(1, 'Kode aset wajib diisi'),
  jenis: z.enum(JENIS, { message: 'Jenis servis tidak valid' }),
  tanggal: z.string().optional(),
  jadwal_berikutnya: z.string().optional().nullable(),
  masalah: z.string().optional().nullable(),
  tindakan: z.string().optional().nullable(),
  biaya: z.coerce.number().min(0).optional(),
  vendor: z.string().max(120).optional().nullable(),
});

const updateSchema = z.object({
  status: z.enum(STATUS, { message: 'Status servis tidak valid' }).optional(),
  jadwal_berikutnya: z.string().optional().nullable(),
  masalah: z.string().optional().nullable(),
  tindakan: z.string().optional().nullable(),
  biaya: z.coerce.number().min(0).optional(),
  vendor: z.string().max(120).optional().nullable(),
  kondisi_akhir: z.enum(KONDISI).optional(),
});

// GET /api/servis
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const conditions = [];
  if (req.query.jenis) conditions.push({ sql: 's.jenis = ?', value: String(req.query.jenis) });
  if (req.query.status) conditions.push({ sql: 's.status = ?', value: String(req.query.status) });
  if (req.query.aset_kode) conditions.push({ sql: 's.aset_kode = ?', value: String(req.query.aset_kode) });
  const search = (req.query.search || req.query.q || '').trim();
  if (search) conditions.push({ sql: '(s.masalah ILIKE ? OR COALESCE(s.vendor,\'\') ILIKE ?)', value: `%${search}%`, repeat: 2 });

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
  const total = (await query(`SELECT COUNT(*)::int AS t FROM servis s ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT s.*, a.nama AS aset_nama FROM servis s
     LEFT JOIN aset a ON a.kode = s.aset_kode
     ${where} ORDER BY s.tanggal DESC, s.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/servis/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, a.nama AS aset_nama FROM servis s
     LEFT JOIN aset a ON a.kode = s.aset_kode WHERE s.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Servis tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/servis — Kuratif sets asset status to Servis
router.post('/', writeAuth, wrap(async (req, res) => {
  const v = validate(createSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;

  const created = await withTransaction(async (client) => {
    const a = await client.query('SELECT kode FROM aset WHERE kode = $1', [b.aset_kode]);
    if (!a.rows[0]) throw new HttpError(404, 'Aset tidak ditemukan');
    const s = await client.query(
      `INSERT INTO servis (aset_kode, jenis, tanggal, jadwal_berikutnya, masalah, tindakan, biaya, vendor)
       VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6,$7,$8) RETURNING *`,
      [b.aset_kode, b.jenis, b.tanggal || null, b.jadwal_berikutnya || null, b.masalah || null,
       b.tindakan || null, b.biaya || 0, b.vendor || null]
    );
    if (b.jenis === 'Kuratif') {
      await client.query(`UPDATE aset SET status = 'Servis' WHERE kode = $1`, [b.aset_kode]);
    }
    return s.rows[0];
  });

  await audit(req, 'servis', created.id, 'CREATE', null, created);
  await assetLog(b.aset_kode, b.jenis === 'Kuratif' ? 'Servis Kuratif' : 'Servis Preventif',
    req.user.username, { servis_id: created.id });
  res.status(201).json({ ok: true, data: created });
}));

// PATCH /api/servis/:id — update status/fields; Kuratif+Selesai restores asset to Aktif
router.patch('/:id', writeAuth, wrap(async (req, res) => {
  const v = validate(updateSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const before = (await query('SELECT * FROM servis WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Servis tidak ditemukan');
  const merged = { ...before, ...b };

  const updated = await withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE servis SET status=$1, jadwal_berikutnya=$2, masalah=$3, tindakan=$4, biaya=$5, vendor=$6
       WHERE id=$7 RETURNING *`,
      [merged.status, merged.jadwal_berikutnya || null, merged.masalah || null, merged.tindakan || null,
       merged.biaya, merged.vendor || null, req.params.id]
    );
    const servis = r.rows[0];
    if (b.status === 'Selesai' && servis.jenis === 'Kuratif') {
      const kondisi = b.kondisi_akhir || 'Baik';
      await client.query(`UPDATE aset SET status = 'Aktif', kondisi = $1 WHERE kode = $2`, [kondisi, servis.aset_kode]);
    }
    return servis;
  });

  await audit(req, 'servis', req.params.id, 'UPDATE', before, updated);
  if (b.status === 'Selesai') {
    await assetLog(updated.aset_kode, 'Servis Selesai', req.user.username,
      { servis_id: updated.id, jenis: updated.jenis, kondisi_akhir: b.kondisi_akhir || 'Baik' });
  }
  res.json({ ok: true, data: updated });
}));

// PATCH /api/servis/:id/status — ubah status ringkas (dipakai ServisPreventif)
router.patch('/:id/status', writeAuth, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!status) throw new HttpError(400, 'Status wajib diisi');
  const before = (await query('SELECT * FROM servis WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Servis tidak ditemukan');
  const updated = await withTransaction(async (client) => {
    const r = await client.query('UPDATE servis SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    const servis = r.rows[0];
    if (status === 'Selesai' && servis.jenis === 'Kuratif') {
      await client.query(`UPDATE aset SET status='Aktif' WHERE kode=$1`, [servis.aset_kode]);
    }
    return servis;
  });
  await audit(req, 'servis', Number(req.params.id), 'UPDATE_STATUS', before, updated);
  res.json({ ok: true, data: updated });
}));

module.exports = router;
