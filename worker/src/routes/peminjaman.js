import { Hono } from 'hono';
import { z } from 'zod';
import { validate, getPagination, paginationMeta, buildWhere, HttpError, parseId } from '../helpers.js';
import { audit, assetLog } from '../auth.js';

const DENDA_PER_HARI = 5000;

const createSchema = z.object({
  aset_kode: z.string().min(1, 'Kode aset wajib diisi'),
  peminjam: z.string().min(1, 'Nama peminjam wajib diisi').max(120),
  unit: z.string().max(120).optional().nullable(),
  keperluan: z.string().optional().nullable(),
  tgl_pinjam: z.string().optional(),
  tgl_kembali_rencana: z.string({ message: 'Tanggal rencana kembali wajib diisi' }),
});

export function peminjamanRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q);
    const conditions = [];
    if (q.status) conditions.push({ sql: 'p.status = ?', value: String(q.status) });
    if (q.aset_kode) conditions.push({ sql: 'p.aset_kode = ?', value: String(q.aset_kode) });
    const { where, params } = buildWhere(conditions);

    const total = (await db.query(`SELECT COUNT(*) AS t FROM peminjaman p ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT p.*, a.nama AS aset_nama FROM peminjaman p
       LEFT JOIN aset a ON a.kode = p.aset_kode
       ${where} ORDER BY p.tgl_pinjam DESC, p.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'), 'Peminjaman');
    const { rows } = await db.query(
      `SELECT p.*, a.nama AS aset_nama FROM peminjaman p
       LEFT JOIN aset a ON a.kode = p.aset_kode WHERE p.id = $1`,
      [id]
    );
    if (!rows[0]) throw new HttpError(404, 'Peminjaman tidak ditemukan');
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', writeAuth, async (c) => {
    const { value: b } = validate(createSchema, await c.req.json().catch(() => ({})));

    const aset = (await db.query('SELECT * FROM aset WHERE kode = $1', [b.aset_kode])).rows[0];
    if (!aset) throw new HttpError(404, 'Aset tidak ditemukan');
    if (aset.status !== 'Aktif') throw new HttpError(409, `Aset tidak dapat dipinjam (status: ${aset.status})`);

    const tglPinjam = b.tgl_pinjam || new Date().toISOString().slice(0, 10);
    if (b.tgl_kembali_rencana < tglPinjam) {
      throw new HttpError(400, 'Tanggal rencana kembali tidak boleh sebelum tanggal pinjam');
    }

    const { rows } = await db.query(
      `INSERT INTO peminjaman (aset_kode, peminjam, unit, keperluan, tgl_pinjam, tgl_kembali_rencana)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.aset_kode, b.peminjam, b.unit || null, b.keperluan || null, tglPinjam, b.tgl_kembali_rencana]
    );
    const created = rows[0];
    await db.query(`UPDATE aset SET status = 'Dipinjam' WHERE kode = $1`, [b.aset_kode]);

    await audit(db, c, 'peminjaman', created.id, 'CREATE', null, created);
    await assetLog(db, b.aset_kode, 'Dipinjam', c.get('user').username, { peminjaman_id: created.id, peminjam: b.peminjam });
    return c.json({ ok: true, data: created }, 201);
  });

  r.patch('/:id/return', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Peminjaman');
    const p = (await db.query('SELECT * FROM peminjaman WHERE id = $1', [id])).rows[0];
    if (!p) throw new HttpError(404, 'Peminjaman tidak ditemukan');
    if (p.status === 'Dikembalikan') throw new HttpError(409, 'Peminjaman ini sudah dikembalikan');

    const now = new Date();
    const aktual = now.toISOString().slice(0, 10);
    const daysLate = Math.max(0, Math.floor((now - new Date(p.tgl_kembali_rencana)) / 86400000));
    const denda = daysLate * DENDA_PER_HARI;

    // Dua write harus atomik: peminjaman ditandai kembali dan status aset pulih.
    await db.withTransaction(async (client) => {
      await client.query(
        `UPDATE peminjaman SET tgl_kembali_aktual = $1, status = 'Dikembalikan', denda = $2 WHERE id = $3`,
        [aktual, denda, id]
      );
      await client.query(`UPDATE aset SET status = 'Aktif' WHERE kode = $1`, [p.aset_kode]);
    });
    const updated = (await db.query('SELECT * FROM peminjaman WHERE id = $1', [id])).rows[0];

    await audit(db, c, 'peminjaman', id, 'UPDATE', p, updated);
    await assetLog(db, p.aset_kode, 'Dikembalikan', c.get('user').username,
      { peminjaman_id: id, denda, hari_terlambat: daysLate });
    return c.json({ ok: true, data: updated, denda, hari_terlambat: daysLate });
  });

  return r;
}