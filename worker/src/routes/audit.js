import { Hono } from 'hono';
import { getPagination, paginationMeta, buildWhere } from '../helpers.js';

export function auditRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate, auth.authorize('admin'));

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q, 50);
    const conditions = [];
    if (q.entitas) conditions.push({ sql: 'a.entitas = ?', value: String(q.entitas) });
    if (q.aksi) conditions.push({ sql: 'a.aksi = ?', value: String(q.aksi) });
    if (q.user_id) conditions.push({ sql: 'a.user_id = ?', value: Number(q.user_id) });
    if (q.username) conditions.push({ sql: 'u.username = ?', value: String(q.username) });
    if (q.dari) conditions.push({ sql: 'a.waktu >= ?', value: String(q.dari) });
    if (q.sampai) conditions.push({ sql: 'a.waktu <= ?', value: String(q.sampai) + ' 23:59:59' });

    const { where, params } = buildWhere(conditions);
    const total = (await db.query(
      `SELECT COUNT(*) AS t FROM audit_trail a LEFT JOIN users u ON u.id = a.user_id ${where}`,
      params
    )).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT a.*, u.username, u.nama AS user_nama FROM audit_trail a
       LEFT JOIN users u ON u.id = a.user_id
       ${where} ORDER BY a.waktu DESC, a.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/entity/:entitas/:id', async (c) => {
    const entitas = c.req.param('entitas');
    const entitasId = c.req.param('id');
    const { limit, offset, page } = getPagination(c.req.query(), 50);
    const total = (await db.query(
      'SELECT COUNT(*) AS t FROM audit_trail WHERE entitas = $1 AND entitas_id = $2',
      [entitas, entitasId]
    )).rows[0].t;
    const { rows } = await db.query(
      `SELECT a.*, u.username, u.nama AS user_nama FROM audit_trail a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entitas = $1 AND a.entitas_id = $2
       ORDER BY a.waktu DESC, a.id DESC LIMIT $3 OFFSET $4`,
      [entitas, entitasId, limit, offset]
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  return r;
}