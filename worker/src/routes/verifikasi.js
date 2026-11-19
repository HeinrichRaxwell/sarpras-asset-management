import { Hono } from 'hono';
import { z } from 'zod';
import { validate, getPagination, paginationMeta, buildWhere, HttpError, parseId } from '../helpers.js';
import { audit } from '../auth.js';

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

export function verifikasiRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q);
    const conditions = [];
    if (q.status) conditions.push({ sql: 'v.status = ?', value: String(q.status) });
    const term = (q.search || q.q || '').trim();
    if (term) conditions.push({ sql: '(v.nama ILIKE ? OR v.kode ILIKE ?)', value: `%${term}%`, repeat: 2 });
    const { where, params } = buildWhere(conditions);

    const total = (await db.query(`SELECT COUNT(*) AS t FROM verifikasi v ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT v.*, u.nama AS dijalankan_oleh_nama,
              (SELECT COUNT(*) FROM opname_item oi WHERE oi.verifikasi_id = v.id) AS jumlah_item
       FROM verifikasi v LEFT JOIN users u ON u.id = v.dijalankan_oleh
       ${where} ORDER BY v.tanggal_mulai DESC, v.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'), 'Sesi verifikasi');
    const { rows } = await db.query(
      `SELECT v.*, u.nama AS dijalankan_oleh_nama FROM verifikasi v
       LEFT JOIN users u ON u.id = v.dijalankan_oleh WHERE v.id = $1`,
      [id]
    );
    if (!rows[0]) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', writeAuth, async (c) => {
    const { value: b } = validate(sessionSchema, await c.req.json().catch(() => ({})));
    const dup = (await db.query('SELECT id FROM verifikasi WHERE kode = $1', [b.kode])).rows[0];
    if (dup) throw new HttpError(409, 'Kode sesi sudah digunakan');
    const { rows } = await db.query(
      `INSERT INTO verifikasi (kode, nama, tanggal_mulai, dijalankan_oleh)
       VALUES ($1,$2,COALESCE($3, date('now')),$4) RETURNING *`,
      [b.kode, b.nama, b.tanggal_mulai || null, c.get('user').id]
    );
    await audit(db, c, 'verifikasi', rows[0].id, 'CREATE', null, rows[0]);
    return c.json({ ok: true, data: rows[0] }, 201);
  });

  r.put('/:id', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Sesi verifikasi');
    const { value: b } = validate(sessionSchema.partial(), await c.req.json().catch(() => ({})));
    const before = (await db.query('SELECT * FROM verifikasi WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
    if (before.status === 'Selesai') throw new HttpError(409, 'Sesi sudah ditutup, tidak dapat diubah');
    const merged = { ...before, ...b };
    const { rows } = await db.query(
      `UPDATE verifikasi SET kode=$1, nama=$2, tanggal_mulai=$3 WHERE id=$4 RETURNING *`,
      [merged.kode, merged.nama, merged.tanggal_mulai, id]
    );
    await audit(db, c, 'verifikasi', id, 'UPDATE', before, rows[0]);
    return c.json({ ok: true, data: rows[0] });
  });

  r.delete('/:id', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Sesi verifikasi');
    const before = (await db.query('SELECT * FROM verifikasi WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
    await db.query('DELETE FROM verifikasi WHERE id = $1', [id]);
    await audit(db, c, 'verifikasi', id, 'DELETE', before, null);
    return c.json({ ok: true, data: { id } });
  });

  r.post('/:id/items', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Sesi verifikasi');
    const { value: b } = validate(itemSchema, await c.req.json().catch(() => ({})));
    const session = (await db.query('SELECT * FROM verifikasi WHERE id = $1', [id])).rows[0];
    if (!session) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
    if (session.status === 'Selesai') throw new HttpError(409, 'Sesi sudah ditutup');
    const asset = (await db.query('SELECT kode FROM aset WHERE kode = $1', [b.aset_kode])).rows[0];
    if (!asset) throw new HttpError(404, 'Aset tidak ditemukan');

    const { rows } = await db.query(
      `INSERT INTO opname_item (verifikasi_id, aset_kode, ditemukan, kondisi_fisik, lokasi_temuan_id, catatan)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (verifikasi_id, aset_kode) DO UPDATE SET
         ditemukan = excluded.ditemukan, kondisi_fisik = excluded.kondisi_fisik,
         lokasi_temuan_id = excluded.lokasi_temuan_id, catatan = excluded.catatan
       RETURNING *`,
      [id, b.aset_kode, b.ditemukan === false ? 0 : 1, b.kondisi_fisik || null,
       b.lokasi_temuan_id || null, b.catatan || null]
    );
    await audit(db, c, 'opname_item', rows[0].id, 'CREATE', null, rows[0]);
    return c.json({ ok: true, data: rows[0] }, 201);
  });

  r.patch('/:id/finish', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Sesi verifikasi');
    const before = (await db.query('SELECT * FROM verifikasi WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
    if (before.status === 'Selesai') throw new HttpError(409, 'Sesi sudah ditutup sebelumnya');
    const { rows } = await db.query(
      `UPDATE verifikasi SET status = 'Selesai', tanggal_selesai = date('now') WHERE id = $1 RETURNING *`,
      [id]
    );
    await audit(db, c, 'verifikasi', id, 'UPDATE', before, rows[0]);
    return c.json({ ok: true, data: rows[0] });
  });

  r.get('/:id/summary', async (c) => {
    const id = parseId(c.req.param('id'), 'Sesi verifikasi');
    const session = (await db.query('SELECT * FROM verifikasi WHERE id = $1', [id])).rows[0];
    if (!session) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
    const counts = (await db.query(
      `SELECT
         COUNT(*) AS total_dicatat,
         SUM(CASE WHEN ditemukan = 1 THEN 1 ELSE 0 END) AS ditemukan,
         SUM(CASE WHEN ditemukan = 0 THEN 1 ELSE 0 END) AS tidak_ditemukan
       FROM opname_item WHERE verifikasi_id = $1`,
      [id]
    )).rows[0];
    const totalAset = (await db.query("SELECT COUNT(*) AS t FROM aset WHERE status <> 'Dihapus'")).rows[0].t;
    return c.json({
      ok: true,
      data: {
        sesi: session,
        total_aset_aktif: totalAset,
        ...counts,
        belum_dicatat: Math.max(0, totalAset - counts.total_dicatat),
      },
    });
  });

  r.get('/:id/items', async (c) => {
    const id = parseId(c.req.param('id'), 'Sesi verifikasi');
    const session = (await db.query('SELECT id FROM verifikasi WHERE id = $1', [id])).rows[0];
    if (!session) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan');
    const { rows } = await db.query(
      `SELECT oi.*, a.nama AS aset_nama, l.nama AS lokasi_temuan FROM opname_item oi
       LEFT JOIN aset a ON a.kode = oi.aset_kode
       LEFT JOIN lokasi l ON l.id = oi.lokasi_temuan_id
       WHERE oi.verifikasi_id = $1 ORDER BY oi.aset_kode`,
      [id]
    );
    return c.json({ ok: true, data: rows });
  });

  return r;
}