// Aset routes — main catalog (PK = kode)
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { authenticate, authorize, audit, assetLog } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, generateAsetKode, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate);

const STATUSES = ['Aktif', 'Dipinjam', 'Servis', 'Mutasi', 'Dihapus'];
const KONDISI = ['Baik', 'Rusak Ringan', 'Rusak Berat'];
const SORT_WHITELIST = new Set(['kode', 'nama', 'nilai_perolehan', 'tanggal_perolehan', 'dibuat_pada', 'status']);

const asetSchema = z.object({
  nama: z.string().min(1).max(200),
  kategori_id: z.coerce.number().int().positive(),
  lokasi_id: z.coerce.number().int().positive().optional().nullable(),
  sumber_dana_id: z.coerce.number().int().positive().optional().nullable(),
  merk: z.string().max(80).optional().nullable(),
  tipe: z.string().max(80).optional().nullable(),
  no_seri: z.string().max(80).optional().nullable(),
  tanggal_perolehan: z.string().optional(),
  nilai_perolehan: z.coerce.number().min(0).optional(),
  kondisi: z.enum(KONDISI).optional(),
  status: z.enum(STATUSES).optional(),
  foto_url: z.string().optional().nullable(),
});

async function validateRefs(client, d) {
  if (d.kategori_id) {
    const r = await client.query('SELECT id FROM kategori WHERE id = $1', [d.kategori_id]);
    if (!r.rows[0]) throw new HttpError(400, 'Kategori tidak ditemukan');
  }
  if (d.lokasi_id) {
    const r = await client.query('SELECT id FROM lokasi WHERE id = $1', [d.lokasi_id]);
    if (!r.rows[0]) throw new HttpError(400, 'Lokasi tidak ditemukan');
  }
  if (d.sumber_dana_id) {
    const r = await client.query('SELECT id FROM sumber_dana WHERE id = $1', [d.sumber_dana_id]);
    if (!r.rows[0]) throw new HttpError(400, 'Sumber dana tidak ditemukan');
  }
}

// GET /api/aset — paginated, searchable, filterable, sortable
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const { search, q, kategori_id, lokasi_id, status, kondisi, sort, order } = req.query;
  const term = (search || q || '').trim();
  const conditions = [];
  if (term) {
    const like = `%${term}%`;
    conditions.push({ sql: '(a.nama ILIKE ? OR a.kode ILIKE ? OR COALESCE(a.merk,\'\') ILIKE ?)', value: like, repeat: 3 });
  }
  if (kategori_id) conditions.push({ sql: 'a.kategori_id = ?', value: Number(kategori_id) });
  if (lokasi_id) conditions.push({ sql: 'a.lokasi_id = ?', value: Number(lokasi_id) });
  if (status) conditions.push({ sql: 'a.status = ?', value: String(status) });
  if (kondisi) conditions.push({ sql: 'a.kondisi = ?', value: String(kondisi) });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    const reps = c.repeat || 1;
    let sql = c.sql;
    for (let i = 0; i < reps; i++) {
      params.push(c.value);
      sql = sql.replace('?', `$${params.length}`);
    }
    clauses.push('(' + sql + ')');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const sortCol = SORT_WHITELIST.has(sort) ? sort : 'dibuat_pada';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';

  const total = (await query(`SELECT COUNT(*)::int AS t FROM aset a ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT a.*, k.nama AS kategori_nama, l.nama AS lokasi_nama, sd.nama AS sumber_dana_nama
     FROM aset a
     LEFT JOIN kategori k ON k.id = a.kategori_id
     LEFT JOIN lokasi l ON l.id = a.lokasi_id
     LEFT JOIN sumber_dana sd ON sd.id = a.sumber_dana_id
     ${where}
     ORDER BY a.${sortCol} ${sortDir}
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/aset/:kode/detail — asset with documents, latest depreciation, active loan
router.get('/:kode/detail', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, k.nama AS kategori_nama, l.nama AS lokasi_nama, sd.nama AS sumber_dana_nama
     FROM aset a
     LEFT JOIN kategori k ON k.id = a.kategori_id
     LEFT JOIN lokasi l ON l.id = a.lokasi_id
     LEFT JOIN sumber_dana sd ON sd.id = a.sumber_dana_id
     WHERE a.kode = $1`,
    [req.params.kode]
  );
  if (!rows[0]) throw new HttpError(404, 'Aset tidak ditemukan');
  const aset = rows[0];
  const dokumen = (await query('SELECT * FROM dokumen WHERE aset_kode = $1 ORDER BY unggah_pada DESC', [aset.kode])).rows;
  const penyusutan = (await query('SELECT * FROM penyusutan WHERE aset_kode = $1 ORDER BY tahun DESC LIMIT 1', [aset.kode])).rows[0] || null;
  const peminjaman = (await query(
    `SELECT * FROM peminjaman WHERE aset_kode = $1 AND status = 'Dipinjam' ORDER BY tgl_pinjam DESC LIMIT 1`,
    [aset.kode]
  )).rows[0] || null;
  const logs = (await query('SELECT * FROM asset_log WHERE aset_kode = $1 ORDER BY waktu DESC LIMIT 20', [aset.kode])).rows;
  res.json({ ok: true, data: { aset, dokumen, penyusutan, peminjaman, asset_log: logs } });
}));

// GET /api/aset/:kode
router.get('/:kode', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, k.nama AS kategori_nama, l.nama AS lokasi_nama, sd.nama AS sumber_dana_nama
     FROM aset a
     LEFT JOIN kategori k ON k.id = a.kategori_id
     LEFT JOIN lokasi l ON l.id = a.lokasi_id
     LEFT JOIN sumber_dana sd ON sd.id = a.sumber_dana_id
     WHERE a.kode = $1`,
    [req.params.kode]
  );
  if (!rows[0]) throw new HttpError(404, 'Aset tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/aset — auto-generates kode AM-YYYY-NNNN
router.post('/', authorize('admin', 'petugas'), wrap(async (req, res) => {
  const v = validate(asetSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  await validateRefs({ query }, b);
  const year = new Date().getFullYear();

  const created = await withTransaction(async (client) => {
    const kode = await generateAsetKode(client, year);
    const r = await client.query(
      `INSERT INTO aset (kode, nama, kategori_id, lokasi_id, sumber_dana_id, merk, tipe, no_seri,
                         tanggal_perolehan, nilai_perolehan, kondisi, status, foto_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, CURRENT_DATE),$10,$11,$12,$13)
       RETURNING *`,
      [kode, b.nama, b.kategori_id, b.lokasi_id || null, b.sumber_dana_id || null,
       b.merk || null, b.tipe || null, b.no_seri || null, b.tanggal_perolehan || null,
       b.nilai_perolehan ?? 0, b.kondisi || 'Baik', b.status || 'Aktif', b.foto_url || null]
    );
    return r.rows[0];
  });

  await audit(req, 'aset', created.kode, 'CREATE', null, created);
  await assetLog(created.kode, 'Masuk', req.user.username, { nilai: created.nilai_perolehan });
  res.status(201).json({ ok: true, data: created });
}));

// PUT /api/aset/:kode
router.put('/:kode', authorize('admin', 'petugas'), wrap(async (req, res) => {
  const v = validate(asetSchema.partial(), req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const before = (await query('SELECT * FROM aset WHERE kode = $1', [req.params.kode])).rows[0];
  if (!before) throw new HttpError(404, 'Aset tidak ditemukan');
  const merged = { ...before, ...b };
  await validateRefs({ query }, merged);

  const updated = await withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE aset SET nama=$1, kategori_id=$2, lokasi_id=$3, sumber_dana_id=$4, merk=$5, tipe=$6,
                       no_seri=$7, tanggal_perolehan=$8, nilai_perolehan=$9, kondisi=$10, status=$11,
                       foto_url=$12
       WHERE kode=$13 RETURNING *`,
      [merged.nama, merged.kategori_id, merged.lokasi_id || null, merged.sumber_dana_id || null,
       merged.merk || null, merged.tipe || null, merged.no_seri || null,
       merged.tanggal_perolehan, merged.nilai_perolehan, merged.kondisi, merged.status,
       merged.foto_url || null, req.params.kode]
    );
    return r.rows[0];
  });

  await audit(req, 'aset', req.params.kode, 'UPDATE', before, updated);
  await assetLog(req.params.kode, 'Update', req.user.username, { fields: Object.keys(b) });
  res.json({ ok: true, data: updated });
}));

// DELETE /api/aset/:kode (admin only). ?hard=true to physically delete; otherwise soft-delete.
router.delete('/:kode', authorize('admin'), wrap(async (req, res) => {
  const before = (await query('SELECT * FROM aset WHERE kode = $1', [req.params.kode])).rows[0];
  if (!before) throw new HttpError(404, 'Aset tidak ditemukan');

  if (req.query.hard === 'true') {
    await withTransaction(async (client) => {
      // Anak-anak aset tidak punya ON DELETE CASCADE; hapus eksplisit supaya
      // hard delete tidak gagal kena FK constraint.
      await client.query('DELETE FROM dokumen WHERE aset_kode = $1', [req.params.kode]);
      await client.query('DELETE FROM asset_log WHERE aset_kode = $1', [req.params.kode]);
      await client.query('DELETE FROM opname_item WHERE aset_kode = $1', [req.params.kode]);
      await client.query('DELETE FROM penyusutan WHERE aset_kode = $1', [req.params.kode]);
      await client.query('DELETE FROM peminjaman WHERE aset_kode = $1', [req.params.kode]);
      await client.query('DELETE FROM mutasi WHERE aset_kode = $1', [req.params.kode]);
      await client.query('DELETE FROM servis WHERE aset_kode = $1', [req.params.kode]);
      await client.query('DELETE FROM penghapusan WHERE aset_kode = $1', [req.params.kode]);
      await client.query('DELETE FROM aset WHERE kode = $1', [req.params.kode]);
    });
    await audit(req, 'aset', req.params.kode, 'DELETE', before, null);
    return res.json({ ok: true, data: { kode: req.params.kode, hard: true } });
  }
  if (before.status === 'Dihapus') throw new HttpError(409, 'Aset sudah berstatus Dihapus; gunakan ?hard=true untuk hapus permanen');
  const { rows } = await query(`UPDATE aset SET status = 'Dihapus' WHERE kode = $1 RETURNING *`, [req.params.kode]);
  await audit(req, 'aset', req.params.kode, 'UPDATE', before, rows[0]);
  await assetLog(req.params.kode, 'Dihapus (soft)', req.user.username, { soft: true });
  res.json({ ok: true, data: rows[0] });
}));

module.exports = router;
