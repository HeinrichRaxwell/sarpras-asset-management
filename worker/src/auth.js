import { verifyToken, signToken, TokenError } from './jwt.js';
import { HttpError } from './helpers.js';

export function makeAuth(env, db) {
  const secret = env.JWT_SECRET;
  if (!secret || secret === 'change_this_secret_in_production') {
    throw new Error('[FATAL] JWT_SECRET belum di-set. Worker menolak melayani permintaan.');
  }
  const expires = env.JWT_EXPIRES || '7d';

  return {
    sign: (user) => signToken({ id: user.id, username: user.username, role: user.role }, secret, expires),

    async authenticate(c, next) {
      const header = c.req.header('authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) throw new HttpError(401, 'Token tidak ditemukan');
      let claims;
      try {
        claims = await verifyToken(token, secret);
      } catch (err) {
        const msg = err instanceof TokenError && err.name === 'TokenExpiredError'
          ? 'Token kedaluwarsa'
          : 'Token tidak valid';
        throw new HttpError(401, msg);
      }
      // read_only dibaca dari DB, bukan dari klaim token: token lama tidak boleh
      // dipakai melewati pembatasan, dan perubahan flag langsung berlaku.
      const row = await db.query('SELECT aktif, read_only FROM users WHERE id = $1', [claims.id]);
      const u = row.rows[0];
      if (!u) throw new HttpError(401, 'Akun tidak ditemukan');
      if (!u.aktif) throw new HttpError(403, 'Akun dinonaktifkan');
      c.set('user', { ...claims, read_only: !!u.read_only });
      await next();
    },

    authorize(...roles) {
      return async (c, next) => {
        const user = c.get('user');
        if (!user) throw new HttpError(401, 'Belum autentikasi');
        if (user.read_only) {
          throw new HttpError(403, 'Akun demo hanya dapat melihat data. Perubahan tidak diizinkan.');
        }
        if (roles.length && !roles.includes(user.role)) {
          throw new HttpError(403, 'Akses ditolak untuk peran Anda');
        }
        await next();
      };
    },
  };
}

// Best-effort: kegagalan audit tidak boleh menggagalkan request.
export async function audit(db, c, entitas, entitasId, aksi, sebelum, sesudah) {
  try {
    const user = c.get('user');
    await db.query(
      `INSERT INTO audit_trail (user_id, entitas, entitas_id, aksi, sebelum, sesudah, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        user?.id ?? null,
        entitas,
        entitasId == null ? null : String(entitasId),
        aksi,
        sebelum ? JSON.stringify(sebelum) : null,
        sesudah ? JSON.stringify(sesudah) : null,
        c.req.header('cf-connecting-ip') || (c.req.header('x-forwarded-for') || '').split(',')[0].trim() || null,
        c.req.header('user-agent') || null,
      ]
    );
  } catch (err) {
    console.error('[audit] gagal mencatat:', err.message);
  }
}

export async function assetLog(db, asetKode, aksi, aktor, detail) {
  try {
    await db.query(
      `INSERT INTO asset_log (aset_kode, aksi, aktor, detail) VALUES ($1,$2,$3,$4)`,
      [asetKode, aksi, aktor || null, detail ? JSON.stringify(detail) : null]
    );
  } catch (err) {
    console.error('[assetLog] gagal:', err.message);
  }
}