import { Hono } from 'hono';
import { validate, getPagination, paginationMeta, buildWhere, HttpError, parseId } from '../helpers.js';
import { audit } from '../auth.js';

// CRUD tabel master (kategori, sumber_dana, lokasi). Ketiganya punya bentuk
// route yang identik di backend Express: list+search, detail, create, update
// merge, delete dengan guard pemakaian. Perbedaan hanya kolom & pesan.
export function masterRoutes({ db, auth, table, label, schema, columns, searchSql, searchRepeat = 1, orderBy = 'nama', usage }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  const cols = columns.filter((c) => c !== 'id');
  const val = (b, c) => (b[c] === undefined || b[c] === '' ? null : b[c]);

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q);
    const term = (q.search || q.q || '').trim();
    const conditions = [];
    if (term) conditions.push({ sql: searchSql, value: `%${term}%`, repeat: searchRepeat });
    const { where, params } = buildWhere(conditions);

    const total = (await db.query(`SELECT COUNT(*) AS t FROM ${table} ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT * FROM ${table} ${where} ORDER BY ${orderBy} LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'), label);
    const { rows } = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, `${label} tidak ditemukan`);
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', writeAuth, async (c) => {
    const { value: b } = validate(schema, await c.req.json().catch(() => ({})));
    // Kolom yang tidak dikirim harus di-omit agar DEFAULT schema berlaku;
    // mengirim null eksplisit akan menabrak NOT NULL pada kolom ber-default.
    const used = cols.filter((col) => b[col] !== undefined && b[col] !== null && b[col] !== '');
    if (!used.length) throw new HttpError(400, 'Tidak ada data yang dikirim');
    const placeholders = used.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await db.query(
      `INSERT INTO ${table} (${used.join(',')}) VALUES (${placeholders}) RETURNING *`,
      used.map((col) => b[col])
    );
    await audit(db, c, table, rows[0].id, 'CREATE', null, rows[0]);
    return c.json({ ok: true, data: rows[0] }, 201);
  });

  r.put('/:id', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), label);
    const { value: b } = validate(schema.partial(), await c.req.json().catch(() => ({})));
    const before = (await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0];
    if (!before) throw new HttpError(404, `${label} tidak ditemukan`);
    const merged = { ...before, ...b };
    const sets = cols.map((col, i) => `${col}=$${i + 1}`).join(', ');
    const { rows } = await db.query(
      `UPDATE ${table} SET ${sets} WHERE id=$${cols.length + 1} RETURNING *`,
      [...cols.map((col) => val(merged, col)), id]
    );
    await audit(db, c, table, id, 'UPDATE', before, rows[0]);
    return c.json({ ok: true, data: rows[0] });
  });

  r.delete('/:id', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), label);
    const before = (await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0];
    if (!before) throw new HttpError(404, `${label} tidak ditemukan`);
    if (usage) {
      const used = (await db.query(usage.sql, [id])).rows[0].t;
      if (used > 0) throw new HttpError(409, `${label} ${usage.message(used)}`);
    }
    await db.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    await audit(db, c, table, id, 'DELETE', before, null);
    return c.json({ ok: true, data: { id } });
  });

  return r;
}