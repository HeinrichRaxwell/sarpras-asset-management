// JWT authentication + RBAC middleware + audit trail helper
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// Refuse to boot in production with the known placeholder secret.
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'change_this_secret_in_production') {
  console.error('[FATAL] JWT_SECRET belum di-set. API menolak start di production.');
  process.exit(1);
}

// Sign a JWT for a user
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// Verify token from Authorization: Bearer <token>
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token tidak ditemukan' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token kedaluwarsa' : 'Token tidak valid';
    return res.status(401).json({ ok: false, error: msg });
  }
}

// Role-based access control
// usage: authorize('admin'), authorize('admin','pimpinan')
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'Belum autentikasi' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Akses ditolak untuk peran Anda' });
    }
    next();
  };
}

// Record an action into audit_trail (best-effort; never blocks the request)
async function audit(req, entitas, entitasId, aksi, sebelum, sesudah) {
  try {
    const userId = req.user?.id ?? null;
    const ip = req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const userAgent = req.headers['user-agent'] || null;
    await query(
      `INSERT INTO audit_trail (user_id, entitas, entitas_id, aksi, sebelum, sesudah, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, entitas, entitasId == null ? null : String(entitasId), aksi,
       sebelum ? JSON.stringify(sebelum) : null,
       sesudah ? JSON.stringify(sesudah) : null,
       ip, userAgent]
    );
  } catch (err) {
    console.error('[audit] gagal mencatat:', err.message);
  }
}

// Record operational event per asset
async function assetLog(asetKode, aksi, aktor, detail) {
  try {
    await query(
      `INSERT INTO asset_log (aset_kode, aksi, aktor, detail)
       VALUES ($1,$2,$3,$4)`,
      [asetKode, aksi, aktor || null, detail ? JSON.stringify(detail) : null]
    );
  } catch (err) {
    console.error('[assetLog] gagal:', err.message);
  }
}

module.exports = { signToken, authenticate, authorize, audit, assetLog };