import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { validate, getPagination, paginationMeta, buildWhere, HttpError, parseId } from '../helpers.js';
import { audit } from '../auth.js';

const createSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter').max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username hanya boleh huruf, angka, dan _.-'),
  password: z.string().min(6, 'Password minimal 6 karakter').max(128),
  nama: z.string().min(1, 'Nama wajib diisi').max(100),
  email: z.string().email('Email tidak valid').max(120).optional().nullable(),
  role: z.enum(['admin', 'petugas', 'pimpinan'], { message: 'Peran tidak valid' }).optional(),
});

const resetSchema = z.object({
  password: z.string().min(6, 'Password minimal 6 karakter').max(128),
});

const PUBLIC_COLS = 'id, username, nama, email, role, aktif, last_login, dibuat_pada';

export function usersRoutes({ db, auth, env }) {
  const r = new Hono();
  r.use('*', auth.authenticate, auth.authorize('admin'));
  const rounds = parseInt(env.BCRYPT_ROUNDS || '12', 10);

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q);
    const term = (q.search || q.q || '').trim();
    const conditions = [];
    if (q.role) conditions.push({ sql: 'role = ?', value: String(q.role) });
    if (q.aktif !== undefined) conditions.push({ sql: 'aktif = ?', value: q.aktif === 'true' ? 1 : 0 });
    if (term) conditions.push({ sql: '(username ILIKE ? OR nama ILIKE ?)', value: `%${term}%`, repeat: 2 });

    const { where, params } = buildWhere(conditions);
    const total = (await db.query(`SELECT COUNT(*) AS t FROM users ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT ${PUBLIC_COLS} FROM users ${where} ORDER BY username LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'), 'Pengguna');
    const { rows } = await db.query(`SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Pengguna tidak ditemukan');
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', async (c) => {
    const { value: b } = validate(createSchema, await c.req.json().catch(() => ({})));
    const existing = (await db.query('SELECT id FROM users WHERE username = $1', [b.username])).rows[0];
    if (existing) throw new HttpError(409, 'Username sudah digunakan');

    const hash = await bcrypt.hash(b.password, rounds);
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, nama, email, role)
       VALUES ($1,$2,$3,$4,COALESCE($5,'petugas')) RETURNING ${PUBLIC_COLS}`,
      [b.username, hash, b.nama, b.email || null, b.role || null]
    );
    await audit(db, c, 'users', rows[0].id, 'CREATE', null, rows[0]);
    return c.json({ ok: true, data: rows[0] }, 201);
  });

  r.patch('/:id/toggle', async (c) => {
    const id = parseId(c.req.param('id'), 'Pengguna');
    const before = (await db.query('SELECT id, username, nama, aktif FROM users WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Pengguna tidak ditemukan');
    if (id === c.get('user').id) throw new HttpError(400, 'Tidak dapat menonaktifkan akun sendiri');

    // aktif disimpan sebagai INTEGER 0/1 di D1, bukan BOOLEAN
    const next = before.aktif ? 0 : 1;
    const { rows } = await db.query(
      `UPDATE users SET aktif = $1 WHERE id = $2 RETURNING id, username, nama, role, aktif`,
      [next, id]
    );
    await audit(db, c, 'users', id, 'UPDATE', before, rows[0]);
    return c.json({ ok: true, data: rows[0] });
  });

  r.patch('/:id/reset-password', async (c) => {
    const id = parseId(c.req.param('id'), 'Pengguna');
    const { value } = validate(resetSchema, await c.req.json().catch(() => ({})));
    const before = (await db.query('SELECT id, username, nama FROM users WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Pengguna tidak ditemukan');
    const hash = await bcrypt.hash(value.password, rounds);
    const { rows } = await db.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username, nama, role`,
      [hash, id]
    );
    await audit(db, c, 'users', id, 'UPDATE', before, { ...rows[0], password_changed: true });
    return c.json({ ok: true, data: rows[0] });
  });

  return r;
}