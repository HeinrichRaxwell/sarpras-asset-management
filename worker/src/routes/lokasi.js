import { Hono } from 'hono';
import { z } from 'zod';
import { validate, getPagination, paginationMeta, HttpError, parseId } from '../helpers.js';
import { audit } from '../auth.js';

const schema = z.object({
  nama: z.string().min(1, 'Nama lokasi wajib diisi').max(120),
  gedung: z.string().max(80).optional().nullable(),
  lantai: z.string().max(20).optional().nullable(),
  penanggung_jawab: z.string().max(100).optional().nullable(),
  parent_id: z.coerce.number().int().positive().optional().nullable(),
});

export function lokasiRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  async function assertParent(parentId) {
    if (!parentId) return;
    const p = await db.query('SELECT id FROM lokasi WHERE id = $1', [parentId]);
    if (!p.rows[0]) throw new HttpError(400, 'Lokasi induk tidak ditemukan');
  }

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q, 100);
    const term = (q.search || q.q || '').trim();

    const clauses = [];
    const params = [];
    if (q.parent_id !== undefined) {
      if (q.parent_id === '' || q.parent_id === 'null') {
        clauses.push('(l.parent_id IS NULL)');
      } else {
        params.push(Number(q.parent_id));
        clauses.push(`(l.parent_id = $${params.length})`);
      }
    }
    if (term) {
      params.push(`%${term}%`);
      clauses.push(`(l.nama ILIKE $${params.length})`);
    }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

    const total = (await db.query(`SELECT COUNT(*) AS t FROM lokasi l ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT l.*, p.nama AS parent_nama FROM lokasi l
       LEFT JOIN lokasi p ON p.id = l.parent_id
       ${where} ORDER BY l.nama LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  // Harus sebelum /:id agar 'tree' tidak dianggap id
  r.get('/tree', async (c) => {
    const { rows } = await db.query('SELECT * FROM lokasi ORDER BY nama');
    const byId = new Map(rows.map((x) => [x.id, { ...x, children: [] }]));
    const tree = [];
    for (const node of byId.values()) {
      if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
      else tree.push(node);
    }
    return c.json({ ok: true, data: tree });
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'), 'Lokasi');
    const { rows } = await db.query(
      `SELECT l.*, p.nama AS parent_nama FROM lokasi l
       LEFT JOIN lokasi p ON p.id = l.parent_id WHERE l.id = $1`,
      [id]
    );
    if (!rows[0]) throw new HttpError(404, 'Lokasi tidak ditemukan');
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', writeAuth, async (c) => {
    const { value: b } = validate(schema, await c.req.json().catch(() => ({})));
    await assertParent(b.parent_id);
    const { rows } = await db.query(
      `INSERT INTO lokasi (nama, gedung, lantai, penanggung_jawab, parent_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.nama, b.gedung || null, b.lantai || null, b.penanggung_jawab || null, b.parent_id || null]
    );
    await audit(db, c, 'lokasi', rows[0].id, 'CREATE', null, rows[0]);
    return c.json({ ok: true, data: rows[0] }, 201);
  });

  r.put('/:id', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Lokasi');
    const { value: b } = validate(schema.partial(), await c.req.json().catch(() => ({})));
    const before = (await db.query('SELECT * FROM lokasi WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Lokasi tidak ditemukan');
    const merged = { ...before, ...b };
    if (merged.parent_id && Number(merged.parent_id) === id) {
      throw new HttpError(400, 'Lokasi tidak boleh menjadi induk dirinya sendiri');
    }
    await assertParent(merged.parent_id);
    const { rows } = await db.query(
      `UPDATE lokasi SET nama=$1, gedung=$2, lantai=$3, penanggung_jawab=$4, parent_id=$5
       WHERE id=$6 RETURNING *`,
      [merged.nama, merged.gedung || null, merged.lantai || null, merged.penanggung_jawab || null, merged.parent_id || null, id]
    );
    await audit(db, c, 'lokasi', id, 'UPDATE', before, rows[0]);
    return c.json({ ok: true, data: rows[0] });
  });

  r.delete('/:id', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Lokasi');
    const before = (await db.query('SELECT * FROM lokasi WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Lokasi tidak ditemukan');
    const used = (await db.query('SELECT COUNT(*) AS t FROM aset WHERE lokasi_id = $1', [id])).rows[0].t;
    if (used > 0) throw new HttpError(409, `Lokasi masih dipakai oleh ${used} aset, tidak dapat dihapus`);
    const child = (await db.query('SELECT COUNT(*) AS t FROM lokasi WHERE parent_id = $1', [id])).rows[0].t;
    if (child > 0) throw new HttpError(409, 'Lokasi masih memiliki sub-lokasi, hapus anak terlebih dahulu');
    await db.query('DELETE FROM lokasi WHERE id = $1', [id]);
    await audit(db, c, 'lokasi', id, 'DELETE', before, null);
    return c.json({ ok: true, data: { id } });
  });

  return r;
}