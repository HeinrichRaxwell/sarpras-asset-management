import { Hono } from 'hono';
import { z } from 'zod';
import { validate, getPagination, paginationMeta, buildWhere, HttpError, parseId } from '../helpers.js';
import { audit, assetLog } from '../auth.js';

const createSchema = z.object({
  aset_kode: z.string().min(1, 'Kode aset wajib diisi'),
  metode: z.enum(['Musnah', 'Lelang', 'Hibah'], { message: 'Metode penghapusan tidak valid' }),
  tanggal: z.string().optional(),
  nilai_buku: z.coerce.number().min(0).optional(),
  nilai_lelang: z.coerce.number().min(0).optional().nullable(),
  alasan: z.string().optional().nullable(),
});

export function penghapusanRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q);
    const conditions = [];
    if (q.status) conditions.push({ sql: 'p.status = ?', value: String(q.status) });
    if (q.metode) conditions.push({ sql: 'p.metode = ?', value: String(q.metode) });
    if (q.aset_kode) conditions.push({ sql: 'p.aset_kode = ?', value: String(q.aset_kode) });
    const { where, params } = buildWhere(conditions);

    const total = (await db.query(`SELECT COUNT(*) AS t FROM penghapusan p ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT p.*, a.nama AS aset_nama, a.lokasi_id AS aset_lokasi_id FROM penghapusan p
       LEFT JOIN aset a ON a.kode = p.aset_kode
       ${where} ORDER BY p.tanggal DESC, p.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'), 'Penghapusan');
    const { rows } = await db.query(
      `SELECT p.*, a.nama AS aset_nama FROM penghapusan p
       LEFT JOIN aset a ON a.kode = p.aset_kode WHERE p.id = $1`,
      [id]
    );
    if (!rows[0]) throw new HttpError(404, 'Penghapusan tidak ditemukan');
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', writeAuth, async (c) => {
    const { value: b } = validate(createSchema, await c.req.json().catch(() => ({})));
    const asset = (await db.query('SELECT * FROM aset WHERE kode = $1', [b.aset_kode])).rows[0];
    if (!asset) throw new HttpError(404, 'Aset tidak ditemukan');
    const sumberDana = asset.sumber_dana_id
      ? (await db.query('SELECT * FROM sumber_dana WHERE id = $1', [asset.sumber_dana_id])).rows[0]
      : null;

    const { rows } = await db.query(
      `INSERT INTO penghapusan (aset_kode, metode, tanggal, nilai_buku, nilai_lelang, alasan)
       VALUES ($1,$2,COALESCE($3, date('now')),COALESCE($4,$5),$6,$7) RETURNING *`,
      [b.aset_kode, b.metode, b.tanggal || null, b.nilai_buku || null, asset.nilai_perolehan || 0,
       b.nilai_lelang || null, b.alasan || null]
    );

    await audit(db, c, 'penghapusan', rows[0].id, 'CREATE', null, rows[0]);
    await assetLog(db, b.aset_kode, 'Usulan Penghapusan', c.get('user').username,
      { penghapusan_id: rows[0].id, metode: b.metode });
    return c.json({
      ok: true,
      data: rows[0],
      ketentuan_penghapusan: sumberDana?.ketentuan_penghapusan || null,
      message: sumberDana?.ketentuan_penghapusan ? `Catatan: ${sumberDana.ketentuan_penghapusan}` : null,
    }, 201);
  });

  r.patch('/:id/approve', auth.authorize('admin', 'pimpinan'), async (c) => {
    const id = parseId(c.req.param('id'), 'Penghapusan');
    const p = (await db.query('SELECT * FROM penghapusan WHERE id = $1', [id])).rows[0];
    if (!p) throw new HttpError(404, 'Penghapusan tidak ditemukan');
    if (p.status !== 'Usulan') throw new HttpError(409, `Usulan sudah diproses (status: ${p.status})`);

    await db.withTransaction(async (client) => {
      await client.query(`UPDATE penghapusan SET status = 'Disetujui', disetujui_oleh = $1 WHERE id = $2`, [c.get('user').id, id]);
      await client.query(`UPDATE aset SET status = 'Dihapus', lokasi_id = NULL WHERE kode = $1`, [p.aset_kode]);
    });
    const updated = (await db.query('SELECT * FROM penghapusan WHERE id = $1', [id])).rows[0];

    // sumber_dana_id tetap di aset setelah penghapusan; hanya status & lokasi berubah.
    // Backend asli membaca result.sumber_dana_id yang tidak pernah ada sehingga
    // ketentuan selalu null — di sini dibaca dari aset.
    const asset = (await db.query('SELECT sumber_dana_id FROM aset WHERE kode = $1', [p.aset_kode])).rows[0];
    const sumberDana = asset?.sumber_dana_id
      ? (await db.query('SELECT ketentuan_penghapusan FROM sumber_dana WHERE id = $1', [asset.sumber_dana_id])).rows[0]
      : null;

    await audit(db, c, 'penghapusan', id, 'UPDATE', p, updated);
    await assetLog(db, p.aset_kode, 'Penghapusan Disetujui', c.get('user').username, { penghapusan_id: id });
    return c.json({
      ok: true,
      data: updated,
      ketentuan_penghapusan: sumberDana?.ketentuan_penghapusan || null,
    });
  });

  return r;
}