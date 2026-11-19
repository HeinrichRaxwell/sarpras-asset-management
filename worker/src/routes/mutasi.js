import { Hono } from 'hono';
import { z } from 'zod';
import { validate, getPagination, paginationMeta, buildWhere, HttpError, parseId } from '../helpers.js';
import { audit, assetLog } from '../auth.js';

const createSchema = z.object({
  aset_kode: z.string().min(1, 'Kode aset wajib diisi'),
  lokasi_tujuan_id: z.coerce.number().int().positive('Lokasi tujuan wajib dipilih'),
  tanggal: z.string().optional(),
  alasan: z.string().optional().nullable(),
  no_bast: z.string().max(50).optional().nullable(),
  disetujui_oleh: z.coerce.number().int().positive().optional().nullable(),
});

const JOINED = `FROM mutasi m
  LEFT JOIN aset a ON a.kode = m.aset_kode
  LEFT JOIN lokasi la ON la.id = m.lokasi_asal_id
  LEFT JOIN lokasi lt ON lt.id = m.lokasi_tujuan_id`;
const SELECT_JOINED = 'm.*, a.nama AS aset_nama, la.nama AS lokasi_asal, lt.nama AS lokasi_tujuan';

export function mutasiRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q);
    const conditions = [];
    if (q.aset_kode) conditions.push({ sql: 'm.aset_kode = ?', value: String(q.aset_kode) });
    if (q.lokasi_tujuan_id) conditions.push({ sql: 'm.lokasi_tujuan_id = ?', value: Number(q.lokasi_tujuan_id) });
    const { where, params } = buildWhere(conditions);

    const total = (await db.query(`SELECT COUNT(*) AS t FROM mutasi m ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT ${SELECT_JOINED} ${JOINED} ${where}
       ORDER BY m.tanggal DESC, m.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'), 'Mutasi');
    const { rows } = await db.query(`SELECT ${SELECT_JOINED} ${JOINED} WHERE m.id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Mutasi tidak ditemukan');
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', writeAuth, async (c) => {
    const { value: b } = validate(createSchema, await c.req.json().catch(() => ({})));
    const tujuan = (await db.query('SELECT id FROM lokasi WHERE id = $1', [b.lokasi_tujuan_id])).rows[0];
    if (!tujuan) throw new HttpError(400, 'Lokasi tujuan tidak ditemukan');
    const aset = (await db.query('SELECT * FROM aset WHERE kode = $1', [b.aset_kode])).rows[0];
    if (!aset) throw new HttpError(404, 'Aset tidak ditemukan');

    const { rows } = await db.query(
      `INSERT INTO mutasi (aset_kode, lokasi_asal_id, lokasi_tujuan_id, tanggal, alasan, no_bast, disetujui_oleh)
       VALUES ($1,$2,$3,COALESCE($4, date('now')),$5,$6,$7) RETURNING *`,
      [b.aset_kode, aset.lokasi_id || null, b.lokasi_tujuan_id, b.tanggal || null,
       b.alasan || null, b.no_bast || null, b.disetujui_oleh || null]
    );
    const created = rows[0];
    await db.query(`UPDATE aset SET lokasi_id = $1 WHERE kode = $2`, [b.lokasi_tujuan_id, b.aset_kode]);

    await audit(db, c, 'mutasi', created.id, 'CREATE', null, created);
    await assetLog(db, b.aset_kode, 'Mutasi', c.get('user').username,
      { mutasi_id: created.id, lokasi_tujuan_id: b.lokasi_tujuan_id, no_bast: created.no_bast });
    return c.json({ ok: true, data: created }, 201);
  });

  r.patch('/:id/approve', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Mutasi');
    const before = (await db.query('SELECT * FROM mutasi WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Mutasi tidak ditemukan');
    if (before.disetujui_oleh) throw new HttpError(409, 'Mutasi sudah disetujui');

    const { rows } = await db.query('UPDATE mutasi SET disetujui_oleh=$1 WHERE id=$2 RETURNING *', [c.get('user').id, id]);
    // Backend asli memakai 'APPROVE' yang melanggar CHECK audit_trail.aksi
    await audit(db, c, 'mutasi', id, 'UPDATE', before, rows[0]);
    await assetLog(db, before.aset_kode, 'Mutasi Disetujui', c.get('user').username,
      { mutasi_id: id, no_bast: before.no_bast });
    return c.json({ ok: true, data: rows[0] });
  });

  return r;
}