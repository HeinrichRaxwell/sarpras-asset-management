// Auth routes — login, me, change password
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { signToken, authenticate, audit } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username dan password wajib diisi' });
    }
    const { rows } = await query(
      'SELECT id, username, password_hash, nama, role, aktif FROM users WHERE username = $1',
      [username.trim()]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Username atau password salah' });
    }
    if (!user.aktif) {
      return res.status(403).json({ ok: false, error: 'Akun dinonaktifkan' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'Username atau password salah' });
    }
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const token = signToken(user);
    await audit(req, 'users', user.id, 'LOGIN', null, { username: user.username });
    res.json({
      ok: true,
      token,
      user: { id: user.id, username: user.username, nama: user.nama, role: user.role },
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ ok: false, error: 'Gagal login' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT id, username, nama, email, role, last_login FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, error: 'User tidak ditemukan' });
  res.json({ ok: true, user: rows[0] });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: 'Password lama dan baru wajib diisi' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ ok: false, error: 'Password baru minimal 8 karakter' });
    }
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const ok = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Password lama salah' });
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
    const hash = await bcrypt.hash(newPassword, rounds);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    await audit(req, 'users', req.user.id, 'UPDATE', null, { aksi: 'ubah_password' });
    res.json({ ok: true, message: 'Password berhasil diubah' });
  } catch (err) {
    console.error('[auth/change-password]', err.message);
    res.status(500).json({ ok: false, error: 'Gagal mengubah password' });
  }
});

// POST /api/auth/logout (client discards token; we just log it)
router.post('/logout', authenticate, async (req, res) => {
  await audit(req, 'users', req.user.id, 'LOGOUT', null, null);
  res.json({ ok: true, message: 'Logout berhasil' });
});

module.exports = router;