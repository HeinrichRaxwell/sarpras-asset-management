import { Hono } from 'hono';
import { z } from 'zod';
import { validate, getPagination, paginationMeta, buildWhere, generateAsetKode, HttpError, parseId } from '../helpers.js';
import { audit, assetLog } from '../auth.js';

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

export function gudangTransitRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q);
    const conditions = [];
    if (q.qc_status) conditions.push({ sql: 'qc_status = ?', value: String(q.qc_status) });
    const term = (q.search || q.q || '').trim();
    if (term) conditions.push({ sql: 'nama_barang ILIKE ?', value: `%${term}%` });
    const { where, params } = buildWhere(conditions);

    const total = (await db.query(`SELECT COUNT(*) AS t FROM gudang_transit ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT * FROM gudang_transit ${where} ORDER BY tgl_terima DESC, id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'), 'Barang transit');
    const { rows } = await db.query('SELECT * FROM gudang_transit WHERE id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'Barang transit tidak ditemukan');
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', writeAuth, async (c) => {
    const { value: b } = validate(createSchema, await c.req.json().catch(() => ({})));
    const { rows } = await db.query(
      `INSERT INTO gudang_transit (nama_barang, pengirim, tgl_terima, qty, catatan_qc)
       VALUES ($1,$2,COALESCE($3, date('now')),COALESCE($4,1),$5) RETURNING *`,
      [b.nama_barang, b.pengirim || null, b.tgl_terima || null, b.qty || null, b.catatan_qc || null]
    );
    await audit(db, c, 'gudang_transit', rows[0].id, 'CREATE', null, rows[0]);
    return c.json({ ok: true, data: rows[0] }, 201);
  });

  r.patch('/:id/qc', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Barang transit');
    const { value: b } = validate(qcSchema, await c.req.json().catch(() => ({})));
    const item = (await db.query('SELECT * FROM gudang_transit WHERE id = $1', [id])).rows[0];
    if (!item) throw new HttpError(404, 'Barang transit tidak ditemukan');

    if (b.qc_status !== 'Lolos') {
      const { rows } = await db.query(
        `UPDATE gudang_transit SET qc_status = $1, catatan_qc = COALESCE($2, catatan_qc) WHERE id = $3 RETURNING *`,
        [b.qc_status, b.catatan_qc || null, id]
      );
      await audit(db, c, 'gudang_transit', id, 'UPDATE', item, rows[0]);
      return c.json({ ok: true, data: rows[0] });
    }

    if (!b.kategori_id) throw new HttpError(400, 'kategori_id wajib diisi saat QC Lolos');
    if (item.aset_kode) throw new HttpError(409, 'Barang ini sudah diproses menjadi aset');
    const kategori = (await db.query('SELECT id FROM kategori WHERE id = $1', [b.kategori_id])).rows[0];
    if (!kategori) throw new HttpError(400, 'Kategori tidak ditemukan');

    const kode = await generateAsetKode(db, new Date().getFullYear());
    // Aset baru dan penandaan transit harus atomik: kalau salah satu gagal,
    // tidak boleh ada aset yatim atau transit yang ditandai tanpa aset.
    await db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO aset (kode, nama, kategori_id, lokasi_id, sumber_dana_id, merk, tipe,
                           nilai_perolehan, tanggal_perolehan, qr_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, date('now')),$10)`,
        [kode, item.nama_barang, b.kategori_id, b.lokasi_id || null, b.sumber_dana_id || null,
         b.merk || null, b.tipe || null, b.nilai_perolehan ?? 0, item.tgl_terima, crypto.randomUUID()]
      );
      await client.query(
        `UPDATE gudang_transit SET qc_status = 'Lolos', catatan_qc = COALESCE($1, catatan_qc), aset_kode = $2
         WHERE id = $3`,
        [b.catatan_qc || null, kode, id]
      );
    });

    const asset = (await db.query('SELECT * FROM aset WHERE kode = $1', [kode])).rows[0];
    const transit = (await db.query('SELECT * FROM gudang_transit WHERE id = $1', [id])).rows[0];

    await audit(db, c, 'gudang_transit', id, 'UPDATE', item, transit);
    await audit(db, c, 'aset', kode, 'CREATE', null, asset);
    await assetLog(db, kode, 'Masuk (QC Lolos)', c.get('user').username, { transit_id: item.id });
    return c.json({ ok: true, data: { transit, aset: asset } });
  });

  return r;
}