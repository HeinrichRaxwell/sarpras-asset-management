// Express application entrypoint — Sarpras Asset Management API
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const asetRoutes = require('./routes/aset');
const kategoriRoutes = require('./routes/kategori');
const lokasiRoutes = require('./routes/lokasi');
const sumberDanaRoutes = require('./routes/sumber_dana');
const gudangTransitRoutes = require('./routes/gudang_transit');
const peminjamanRoutes = require('./routes/peminjaman');
const mutasiRoutes = require('./routes/mutasi');
const servisRoutes = require('./routes/servis');
const penyusutanRoutes = require('./routes/penyusutan');
const penghapusanRoutes = require('./routes/penghapusan');
const dokumenRoutes = require('./routes/dokumen');
const verifikasiRoutes = require('./routes/verifikasi');
const auditRoutes = require('./routes/audit');
const dashboardRoutes = require('./routes/dashboard');
const kirRoutes = require('./routes/kir');
const usersRoutes = require('./routes/users');
const { pool } = require('./db');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());

// CORS: allow-list from CORS_ORIGINS env (comma-separated). Dev fallback allows all.
const rawOrigins = process.env.CORS_ORIGINS || '';
const allowedOrigins = rawOrigins.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate-limit login attempts (brute-force guard)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
});
app.use('/api/auth/login', loginLimiter);

// Public health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'sarpras-asset-management', time: new Date().toISOString() });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/aset', asetRoutes);
app.use('/api/kategori', kategoriRoutes);
app.use('/api/lokasi', lokasiRoutes);
app.use('/api/sumber-dana', sumberDanaRoutes);
app.use('/api/gudang-transit', gudangTransitRoutes);
app.use('/api/gudang', gudangTransitRoutes); // alias dipakai frontend
app.use('/api/peminjaman', peminjamanRoutes);
app.use('/api/mutasi', mutasiRoutes);
app.use('/api/servis', servisRoutes);
app.use('/api/penyusutan', penyusutanRoutes);
app.use('/api/penghapusan', penghapusanRoutes);
app.use('/api/dokumen', dokumenRoutes);
app.use('/api/verifikasi', verifikasiRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/kir', kirRoutes);
app.use('/api/users', usersRoutes);

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Endpoint tidak ditemukan: ${req.method} ${req.originalUrl}` });
});

// Global error handler — always JSON { ok:false, error }
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Terjadi kesalahan pada server';
  if (err.code === '23505') { status = 409; message = 'Data sudah ada (duplikat)'; }
  else if (err.code === '23503') { status = 400; message = 'Data terkait tidak ditemukan (referensi tidak valid)'; }
  else if (err.code === '23514') { status = 400; message = 'Data melanggar batasan database'; }
  else if (err.code === '22P02') { status = 400; message = 'Format data tidak valid'; }
  if (process.env.NODE_ENV !== 'production') {
    console.error('[error]', status, message);
    if (status >= 500 && err.stack) console.error(err.stack);
  }
  if (status >= 500 && process.env.NODE_ENV === 'production') {
    message = 'Terjadi kesalahan pada server';
  }
  res.status(status).json({ ok: false, error: message });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
const server = app.listen(PORT, () => {
  console.log(`[sarpras-api] listening on http://localhost:${PORT}/api`);
});

// Graceful shutdown — stop accepting new connections, drain pool
async function shutdown(signal) {
  console.log(`[sarpras-api] ${signal} received, shutting down...`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('[sarpras-api] pool closed');
      process.exit(0);
    } catch (err) {
      console.error('[sarpras-api] shutdown error:', err.message);
      process.exit(1);
    }
  });
  // Force exit if graceful shutdown hangs
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
