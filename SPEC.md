# SHARED SPEC — SARPRAS ASSET MANAGEMENT
File ini adalah kontrak teknis WAJIB untuk semua developer. Jangan menyimpang.

## Stack
- Backend: Node.js 20 + Express + pg (PostgreSQL 16). CommonJS. Env: DATABASE_URL, JWT_SECRET, JWT_EXPIRES, BCRYPT_ROUNDS, CORS_ORIGINS.
- Frontend: VANILLA multi-page HTML + Tailwind CDN + Chart.js CDN + vanilla JS (fetch). TANPA React, TANPA build step untuk halaman (sesuai struktur brief UTS). File di `frontend/pages/*.html` dan `frontend/index.html` (login).
- Auth: JWT di header `Authorization: Bearer <token>`. Simpan token di localStorage key `sarpras_token`. User object di localStorage `sarpras_user`.
- Semua response API bentuk: `{ ok: true, data }` atau `{ ok: false, error }`.

## Base API URL
Frontend panggil API di `http://localhost:3001/api`. Simpan base URL di `frontend/assets/js/config.js` sebagai `window.API_BASE = 'http://localhost:3001/api';`

## Backend Routes (prefix /api)
- POST /auth/login {username,password} -> {token,user}
- GET /auth/me ; POST /auth/change-password {oldPassword,newPassword} ; POST /auth/logout
- /aset (GET list w/ q, kategori_id, lokasi_id, status, kondisi; GET /:kode; POST; PUT /:kode; DELETE /:kode)
- /kategori (CRUD) · /lokasi (CRUD, nested by parent_id) · /sumber-dana (GET,POST,PUT)
- /gudang (GET, POST, PATCH /:id/qc {qc_status, catatan_qc, aset_kode} — saat Lolos otomatis buat aset)
- /peminjaman (GET, POST, PATCH /:id/kembalikan, GET /terlambat)
- /mutasi (GET, POST) · /servis (GET ?jenis=, POST, PATCH /:id/status) · /penyusutan (GET, POST hitung)
- /penghapusan (GET, POST, PATCH /:id/setujui) · /verifikasi (GET, POST, GET /:id/items, POST /:id/scan)
- /audit (GET, admin only) · /dashboard (GET ringkasan) · /kir/:lokasi_id (GET Kartu Inventaris Ruang) · /users (admin CRUD)
- GET /health (public)

## DB Schema (lihat backend/src/schema.sql)
Tabel: users, kategori, sumber_dana, lokasi, gudang_transit, aset, peminjaman, mutasi, servis, penyusutan, penghapusan, dokumen, verifikasi, opname_item, audit_trail, asset_log.
Aset PK = `kode` (varchar, contoh AM-2024-0001), bukan id.
Baca `backend/src/schema.sql` untuk kolom persisnya.

## Seed akun (sudah di seed.sql, bcrypt terverifikasi)
admin/admin123 · petugas/petugas123 · pimpinan/pimpinan123
Roles: admin (semua), petugas (operasional, tidak boleh hapus master & approve penghapusan), pimpinan (read + approve penghapusan/mutasi).

## DESIGN SYSTEM — GLASSMORPHISM (WAJIB KONSISTEN)
CSS variables (letakkan di assets/css/glass.css):
```
--glass-blur: 22px; --glass-opacity: 0.55; --glass-saturation: 1.4;
--glass-edge: rgba(255,255,255,.14); --radius-panel: 20px; --radius-control: 10px;
--accent: #2563eb; --accent-fg: #fff;
--bg: #eef2f7; --ink: #0f172a; --muted: #64748b;
```
Glass panel class `.glass`:
```
background: rgba(255,255,255,.55);
backdrop-filter: blur(22px) saturate(1.4);
-webkit-backdrop-filter: blur(22px) saturate(1.4);
border: 1px solid rgba(255,255,255,.35);
border-radius: var(--radius-panel);
box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 20px 50px -20px rgba(15,23,42,.25);
```
Latar body pakai gradient + blob dekoratif (blur circles) di belakang panel agar efek kaca terlihat. Support dark mode (toggle, simpan di localStorage `sarpras_theme`).

## Frontend Layout
- Login (`index.html`): centered glass card, logo, form username/password, error inline.
- Layout (`layout.html` + tiap halaman): Sidebar kiri (collapsible, grouped menu sesuai daftar menu resmi), Topbar (judul halaman, search global, notif bell, theme toggle, avatar+nama), Content area (glass panels), Footer kecil.
- Sidebar menu EXACT (13 halaman):
  Dashboard · Data Master[Data Aset, Gudang Transit (QC), Kategori Aset, Lokasi Aset] · Keuangan Aset[Penyusutan Nilai, Sumber Dana] · Operasional[Peminjaman Aset, Mutasi Antar-Ruang, Servis Kuratif, Servis Preventif] · Verifikasi & Audit[Inventarisasi Fisik, Audit Trail] · Hilir & Rekap[Penghapusan & Lelang, Laporan Aset (KIR)] · Manajemen Sistem[Pengguna & Peran, Pengaturan] · Keluar.
- Responsif: mobile sidebar jadi drawer (overlay), grid jadi 1 kolom.

## Kualitas
- TIDAK ADA placeholder "contoh"/"lorem". Data contoh boleh hanya lewat seed DB (riil-tipe).
- Validasi form client + server. Loading state, empty state, error toast.
- Tabel punya search, filter, pagination, sort.
- Semua file lengkap, TIDAK ADA stub/TODO/truncated.