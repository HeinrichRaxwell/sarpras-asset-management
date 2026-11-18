// Gudang transit routes — incoming goods QC before becoming assets
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { authenticate, authorize, audit, assetLog } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, generateAsetKode, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);
const writeAuth = authorize('admin', 'petugas');

const QC_STATUSES = ['Menunggu', 'Lolos', 'Ditolak'];

const createSchema = z.object({
  nama_barang: z.string().min(1, 'Nama barang wajib diisi').max(200),
  pengirim: z.string().max(150).optional().nullable(),
  tgl_terima: z.string().optional(),
  qty: z.coerce.number().int().positive('Qty harus > 0').optional(),
  catatan_qc: z.string().optional().nullable(),
});

const qcSchema = z.object({
  qc_status: z.enum(QC_STATUSES, { message: 'Status QC tidak valid' }),
  catatan_qc: z.string().optional().nullable(),
  kategori_id: z.coerce.number().int().positive().optional(),
  lokasi_id: z.coerce.number().int().positive().optional().nullable(),
  sumber_dana_id: z.coerce.number().int().positive().optional().nullable(),
  nilai_perolehan: z.coerce.number().min(0).optional(),
  merk: z.string().max(80).optional().nullable(),
  tipe: z.string().max(80).optional().nullable(),
});

// GET /api/gudang-transit
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const conditions = [];
  if (req.query.qc_status) conditions.push({ sql: 'qc_status = ?', value: String(req.query.qc_status) });
  const search = (req.query.search || req.query.q || '').trim();
  if (search) conditions.push({ sql: 'nama_barang ILIKE ?', value: `%${search}%` });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    params.push(c.value);
    clauses.push('(' + c.sql.replace('?', `$${params.length}`) + ')');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS t FROM gudang_transit ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT * FROM gudang_transit ${where} ORDER BY tgl_terima DESC, id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/gudang-transit/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM gudang_transit WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Barang transit tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/gudang-transit — record incoming goods
router.post('/', writeAuth, wrap(async (req, res) => {
  const v = validate(createSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const { rows } = await query(
    `INSERT INTO gudang_transit (nama_barang, pengirim, tgl_terima, qty, catatan_qc)
     VALUES ($1,$2,COALESCE($3, CURRENT_DATE),COALESCE($4,1),$5) RETURNING *`,
    [b.nama_barang, b.pengirim || null, b.tgl_terima || null, b.qty || null, b.catatan_qc || null]
  );
  await audit(req, 'gudang_transit', rows[0].id, 'CREATE', null, rows[0]);
  res.status(201).json({ ok: true, data: rows[0] });
}));

// PATCH /api/gudang-transit/:id/qc — set QC status; on 'Lolos' auto-create an aset
router.patch('/:id/qc', writeAuth, wrap(async (req, res) => {
  const v = validate(qcSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const item = (await query('SELECT * FROM gudang_transit WHERE id = $1', [req.params.id])).rows[0];
  if (!item) throw new HttpError(404, 'Barang transit tidak ditemukan');

  if (b.qc_status !== 'Lolos') {
    const { rows } = await query(
      `UPDATE gudang_transit SET qc_status = $1, catatan_qc = COALESCE($2, catatan_qc) WHERE id = $3 RETURNING *`,
      [b.qc_status, b.catatan_qc || null, req.params.id]
    );
    await audit(req, 'gudang_transit', req.params.id, 'UPDATE', item, rows[0]);
    return res.json({ ok: true, data: rows[0] });
  }

  // Passing QC: create the asset in the same transaction
  if (!b.kategori_id) throw new HttpError(400, 'kategori_id wajib diisi saat QC Lolos');
  if (item.aset_kode) throw new HttpError(409, 'Barang ini sudah diproses menjadi aset');

  const year = new Date().getFullYear();
  const result = await withTransaction(async (client) => {
    const kode = await generateAsetKode(client, year);
    const a = await client.query(
      `INSERT INTO aset (kode, nama, kategori_id, lokasi_id, sumber_dana_id, merk, tipe,
                         nilai_perolehan, tanggal_perolehan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, CURRENT_DATE)) RETURNING *`,
      [kode, item.nama_barang, b.kategori_id, b.lokasi_id || null, b.sumber_dana_id || null,
       b.merk || null, b.tipe || null, b.nilai_perolehan ?? 0, item.tgl_terima]
    );
    const asset = a.rows[0];
    const t = await client.query(
      `UPDATE gudang_transit SET qc_status = 'Lolos', catatan_qc = COALESCE($1, catatan_qc), aset_kode = $2
       WHERE id = $3 RETURNING *`,
      [b.catatan_qc || null, asset.kode, req.params.id]
    );
    return { asset, transit: t.rows[0] };
  });

  await audit(req, 'gudang_transit', req.params.id, 'UPDATE', item, result.transit);
  await audit(req, 'aset', result.asset.kode, 'CREATE', null, result.asset);
  await assetLog(result.asset.kode, 'Masuk (QC Lolos)', req.user.username, { transit_id: item.id });
  res.json({ ok: true, data: { transit: result.transit, aset: result.asset } });
}));

module.exports = router;
