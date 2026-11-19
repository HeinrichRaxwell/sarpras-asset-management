import { Hono } from 'hono';
import { makeDb } from './db.js';
import { makeAuth } from './auth.js';
import { verifyToken } from './jwt.js';
import { HttpError } from './helpers.js';
import { authRoutes } from './routes/auth.js';
import { kategoriRoutes, sumberDanaRoutes } from './routes/kategori.js';
import { lokasiRoutes } from './routes/lokasi.js';
import { asetRoutes } from './routes/aset.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { dokumenRoutes } from './routes/dokumen.js';
import { auditRoutes } from './routes/audit.js';
import { kirRoutes } from './routes/kir.js';
import { usersRoutes } from './routes/users.js';
import { peminjamanRoutes } from './routes/peminjaman.js';
import { servisRoutes } from './routes/servis.js';
import { mutasiRoutes } from './routes/mutasi.js';
import { penyusutanRoutes } from './routes/penyusutan.js';
import { penghapusanRoutes } from './routes/penghapusan.js';
import { gudangTransitRoutes } from './routes/gudang_transit.js';
import { verifikasiRoutes } from './routes/verifikasi.js';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// Rate limit per-isolate di memori. Bukan pengganti rate limiting global;
// cukup untuk meredam brute force login pada satu colo.
const hits = new Map();
const WINDOW_MS = 60_000;

function rateLimit(key, max) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now - rec.start > WINDOW_MS) {
    hits.set(key, { start: now, n: 1 });
    return true;
  }
  rec.n += 1;
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  }
  return rec.n <= max;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      const res = await env.ASSETS.fetch(request);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
      if (url.pathname === '/' || url.pathname.endsWith('.html')) {
        headers.set('Cache-Control', 'no-store, must-revalidate');
      }
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }

    const app = new Hono();

    app.use('*', async (c, next) => {
      await next();
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
      c.header('Cache-Control', 'no-store');
    });

    app.onError((err, c) => {
      if (err instanceof HttpError) {
        return c.json({ ok: false, error: err.message }, err.status);
      }
      console.error('[api]', err.message, err.stack);
      return c.json({ ok: false, error: 'Terjadi kesalahan pada server' }, 500);
    });

    app.notFound((c) => c.json({ ok: false, error: 'Endpoint tidak ditemukan' }, 404));

    app.get('/api/health', (c) => c.json({ ok: true, status: 'healthy', runtime: 'cloudflare-workers' }));

    let ctxDeps;
    try {
      const db = makeDb(env.DB);
      const auth = makeAuth(env, db);
      ctxDeps = { db, auth, env };
    } catch (err) {
      console.error(err.message);
      return c_json_fatal();
    }

    // Login dibatasi ketat untuk meredam brute force; endpoint lain lebih longgar.
    app.use('/api/auth/login', async (c, next) => {
      const ip = c.req.header('cf-connecting-ip') || 'unknown';
      if (!rateLimit(`login:${ip}`, 10)) {
        return c.json({ ok: false, error: 'Terlalu banyak percobaan login. Coba lagi dalam satu menit.' }, 429);
      }
      await next();
    });
    app.use('/api/*', async (c, next) => {
      const ip = c.req.header('cf-connecting-ip') || 'unknown';
      if (!rateLimit(`api:${ip}`, 600)) {
        return c.json({ ok: false, error: 'Terlalu banyak permintaan.' }, 429);
      }
      await next();
    });

    // Semua metode tulis diblokir untuk akun read-only, termasuk endpoint yang
    // hanya memakai authenticate (mis. change-password) tanpa authorize.
    const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    const WRITE_EXEMPT = new Set(['/api/auth/login', '/api/auth/logout']);
    app.use('/api/*', async (c, next) => {
      if (!WRITE_METHODS.has(c.req.method) || WRITE_EXEMPT.has(new URL(c.req.url).pathname)) {
        return next();
      }
      const header = c.req.header('authorization') || '';
      if (!header.startsWith('Bearer ')) return next();
      try {
        const claims = await verifyToken(header.slice(7), env.JWT_SECRET);
        const row = await ctxDeps.db.query('SELECT read_only FROM users WHERE id = $1', [claims.id]);
        if (row.rows[0]?.read_only) {
          return c.json({ ok: false, error: 'Akun demo hanya dapat melihat data. Perubahan tidak diizinkan.' }, 403);
        }
      } catch {
        // Token invalid ditangani authenticate di route terkait.
      }
      return next();
    });

    app.route('/api/auth', authRoutes(ctxDeps));
    app.route('/api/kategori', kategoriRoutes(ctxDeps));
    app.route('/api/sumber-dana', sumberDanaRoutes(ctxDeps));
    app.route('/api/lokasi', lokasiRoutes(ctxDeps));
    app.route('/api/aset', asetRoutes(ctxDeps));
    app.route('/api/dashboard', dashboardRoutes(ctxDeps));
    app.route('/api/dokumen', dokumenRoutes(ctxDeps));
    app.route('/api/audit', auditRoutes(ctxDeps));
    app.route('/api/kir', kirRoutes(ctxDeps));
    app.route('/api/users', usersRoutes(ctxDeps));
    app.route('/api/peminjaman', peminjamanRoutes(ctxDeps));
    app.route('/api/servis', servisRoutes(ctxDeps));
    app.route('/api/mutasi', mutasiRoutes(ctxDeps));
    app.route('/api/penyusutan', penyusutanRoutes(ctxDeps));
    app.route('/api/penghapusan', penghapusanRoutes(ctxDeps));
    app.route('/api/gudang-transit', gudangTransitRoutes(ctxDeps));
    app.route('/api/verifikasi', verifikasiRoutes(ctxDeps));

    return app.fetch(request, env, ctx);
  },
};

function c_json_fatal() {
  return new Response(JSON.stringify({ ok: false, error: 'Konfigurasi server belum lengkap' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
  });
}