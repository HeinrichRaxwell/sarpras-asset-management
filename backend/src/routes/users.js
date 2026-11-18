// Users routes — admin-only user administration
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query } = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { validate, getPagination, paginationMeta, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate, authorize('admin'));

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

// GET /api/users
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query);
  const search = (req.query.search || req.query.q || '').trim();
  const conditions = [];
  if (req.query.role) conditions.push({ sql: 'role = ?', value: String(req.query.role) });
  if (req.query.aktif !== undefined) conditions.push({ sql: 'aktif = ?', value: req.query.aktif === 'true' });
  if (search) conditions.push({ sql: '(username ILIKE ? OR nama ILIKE ?)', value: `%${search}%`, repeat: 2 });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    let sql = c.sql;
    for (let i = 0; i < (c.repeat || 1); i++) {
      params.push(c.value);
      sql = sql.replace('?', `$${params.length}`);
    }
    clauses.push('(' + sql + ')');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS t FROM users ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT id, username, nama, email, role, aktif, last_login, dibuat_pada
     FROM users ${where} ORDER BY username LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/users/:id
router.get('/:id', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, username, nama, email, role, aktif, last_login, dibuat_pada FROM users WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Pengguna tidak ditemukan');
  res.json({ ok: true, data: rows[0] });
}));

// POST /api/users
router.post('/', wrap(async (req, res) => {
  const v = validate(createSchema, req.body, res);
  if (!v.ok) return;
  const b = v.value;
  const hash = await bcrypt.hash(b.password, 12);
  try {
    const { rows } = await query(
      `INSERT INTO users (username, password_hash, nama, email, role)
       VALUES ($1,$2,$3,$4,COALESCE($5,'petugas')) RETURNING id, username, nama, email, role, aktif, dibuat_pada`,
      [b.username, hash, b.nama, b.email || null, b.role || null]
    );
    await audit(req, 'users', rows[0].id, 'CREATE', null, rows[0]);
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'Username sudah digunakan');
    throw err;
  }
}));

// PATCH /api/users/:id/toggle — enable/disable a user
router.patch('/:id/toggle', wrap(async (req, res) => {
  const before = (await query('SELECT id, username, nama, aktif FROM users WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Pengguna tidak ditemukan');
  if (Number(req.params.id) === req.user.id) throw new HttpError(400, 'Tidak dapat menonaktifkan akun sendiri');
  const { rows } = await query(
    `UPDATE users SET aktif = NOT $1 WHERE id = $2 RETURNING id, username, nama, role, aktif`,
    [before.aktif, req.params.id]
  );
  await audit(req, 'users', req.params.id, 'UPDATE', before, rows[0]);
  res.json({ ok: true, data: rows[0] });
}));

// PATCH /api/users/:id/reset-password
router.patch('/:id/reset-password', wrap(async (req, res) => {
  const v = validate(resetSchema, req.body, res);
  if (!v.ok) return;
  const before = (await query('SELECT id, username, nama FROM users WHERE id = $1', [req.params.id])).rows[0];
  if (!before) throw new HttpError(404, 'Pengguna tidak ditemukan');
  const hash = await bcrypt.hash(v.value.password, 12);
  const { rows } = await query(
    `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username, nama, role`,
    [hash, req.params.id]
  );
  await audit(req, 'users', req.params.id, 'UPDATE', before, { ...rows[0], password_changed: true });
  res.json({ ok: true, data: rows[0] });
}));

module.exports = router;
