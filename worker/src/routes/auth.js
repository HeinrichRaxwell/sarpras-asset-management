import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { HttpError } from '../helpers.js';
import { audit } from '../auth.js';

export function authRoutes({ db, auth, env }) {
  const r = new Hono();

  r.post('/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { username, password } = body || {};
    if (!username || !password) throw new HttpError(400, 'Username dan password wajib diisi');

    const { rows } = await db.query(
      'SELECT id, username, password_hash, nama, role, aktif, read_only FROM users WHERE username = $1',
      [String(username).trim()]
    );
    const user = rows[0];
    if (!user) throw new HttpError(401, 'Username atau password salah');
    if (!user.aktif) throw new HttpError(403, 'Akun dinonaktifkan');

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) throw new HttpError(401, 'Username atau password salah');

    await db.query("UPDATE users SET last_login = datetime('now') WHERE id = $1", [user.id]);
    const token = await auth.sign(user);
    await audit(db, c, 'users', user.id, 'LOGIN', null, { username: user.username });

    return c.json({
      ok: true,
      token,
      user: { id: user.id, username: user.username, nama: user.nama, role: user.role, read_only: !!user.read_only },
    });
  });

  r.get('/me', auth.authenticate, async (c) => {
    const { rows } = await db.query(
      'SELECT id, username, nama, email, role, read_only, last_login FROM users WHERE id = $1',
      [c.get('user').id]
    );
    if (!rows[0]) throw new HttpError(404, 'User tidak ditemukan');
    return c.json({ ok: true, user: rows[0] });
  });

  r.post('/change-password', auth.authenticate, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { oldPassword, newPassword } = body || {};
    if (!oldPassword || !newPassword) throw new HttpError(400, 'Password lama dan baru wajib diisi');
    if (String(newPassword).length < 8) throw new HttpError(400, 'Password baru minimal 8 karakter');

    const userId = c.get('user').id;
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw new HttpError(404, 'User tidak ditemukan');
    const ok = await bcrypt.compare(String(oldPassword), rows[0].password_hash);
    if (!ok) throw new HttpError(401, 'Password lama salah');

    const rounds = parseInt(env.BCRYPT_ROUNDS || '12', 10);
    const hash = await bcrypt.hash(String(newPassword), rounds);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    await audit(db, c, 'users', userId, 'UPDATE', null, { aksi: 'ubah_password' });
    return c.json({ ok: true, message: 'Password berhasil diubah' });
  });

  r.post('/logout', auth.authenticate, async (c) => {
    await audit(db, c, 'users', c.get('user').id, 'LOGOUT', null, null);
    return c.json({ ok: true, message: 'Logout berhasil' });
  });

  return r;
}