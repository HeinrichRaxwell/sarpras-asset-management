# 🏛️ SARPRAS AM — Sistem Manajemen Sarana & Prasarana

Admin panel full-stack untuk pengelolaan aset organisasi: dari perolehan, mutasi, peminjaman, servis preventif/kuratif, penyusutan, hingga penghapusan & laporan KIR (Kartu Inventaris Ruang).

![Stack](https://img.shields.io/badge/Backend-Node.js%20·%20Express-339933)
![DB](https://img.shields.io/badge/Database-PostgreSQL%2016-336791)
![Frontend](https://img.shields.io/badge/Frontend-HTML%20·%20Tailwind%20·%20Chart.js-06B6D4)
![Infra](https://img.shields.io/badge/Infra-Docker%20Compose-2496ED)

---

## ✨ Fitur

- **Dashboard analitik** — KPI, doughnut/bar/line Chart.js, alert otomatis, aktivitas terbaru
- **Data Master** — Data Aset (katalog + QR token + dokumen), Gudang Transit (QC barang masuk), Kategori, Lokasi (hierarki Gedung→Lantai→Ruang)
- **Keuangan** — Penyusutan (garis lurus & saldo menurun, uji impairment), Sumber Dana (APBD/APBN/Hibah/Wakaf/BOS)
- **Operasional** — Peminjaman (+denda terlambat), Mutasi antar-ruang (BAST), Servis Kuratif, Servis Preventif (jadwal berkala)
- **Verifikasi & Audit** — Inventarisasi fisik (stock opname), Audit Trail (siapa/apa/kapan)
- **Hilir & Rekap** — Penghapusan & Lelang (alur persetujuan), Laporan KIR (export CSV)
- **RBAC** — 3 peran: Admin, Petugas, Pimpinan
- **Glassmorphism UI** — panel semi-transparan, backdrop blur, dark/light mode, responsif

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|---|---|
| Backend | Node.js 20, Express, pg, JWT, bcryptjs, zod, helmet, express-rate-limit |
| Database | PostgreSQL 16 (Docker) |
| Frontend | HTML5 multi-page, Tailwind CDN, Chart.js, vanilla JS (ES6) |
| Infra | Docker Compose (db + api + web/nginx) |

---

## 🚀 Menjalankan Proyek

### Prasyarat
- Docker Desktop berjalan
- Git

### 1. Clone & jalankan
```bash
git clone https://github.com/HeinrichRaxwell/sarpras-asset-management.git
cd sarpras-asset-management
docker compose up -d --build
```

### 2. Akses aplikasi
| Layanan | URL |
|---|---|
| Frontend (nginx) | http://localhost:8080 |
| Backend API | http://localhost:3001/api |
| PostgreSQL | localhost:5433 |

### 3. Login
| Peran | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Petugas | `petugas` | `petugas123` |
| Pimpinan | `pimpinan` | `pimpinan123` |

> ⚠️ Password default hanya untuk development. Ganti segera di production.

---

## 📁 Struktur Folder

```
sarpras-asset-management/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express app + middleware
│   │   ├── db.js             # PostgreSQL pool
│   │   ├── schema.sql        # DDL 15 tabel + constraint + index
│   │   ├── seed.sql          # Data awal (riil-tipe)
│   │   ├── migrate.js        # Skrip migrasi
│   │   ├── middleware/auth.js# JWT + RBAC + audit
│   │   └── routes/           # 17 route modul
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── index.html            # Login
│   ├── layout.html           # Template shell
│   ├── pages/                # 17 halaman admin
│   ├── assets/{css,js,img}/
│   ├── Dockerfile
│   └── nginx.conf            # Serve static + proxy /api
├── docs/
│   └── PERANCANGAN.md        # ER-D, menu, design system
└── docker-compose.yml
```

---

## 🔌 API Endpoints (ringkas)

| Method | Path | Deskripsi |
|---|---|---|
| POST | `/api/auth/login` | Login, dapat JWT |
| GET | `/api/dashboard` | KPI + chart + alert |
| CRUD | `/api/aset` | Katalog aset |
| CRUD | `/api/kategori` `/api/lokasi` `/api/sumber-dana` | Master data |
| GET/POST | `/api/gudang-transit` | QC barang masuk |
| CRUD | `/api/peminjaman` `/api/mutasi` `/api/servis` | Operasional |
| GET/POST | `/api/penyusutan` | Hitung penyusutan |
| GET | `/api/kir/:lokasiId` | Kartu Inventaris Ruang |
| GET | `/api/audit` | Audit trail (admin) |

Semua respons: `{ ok: true, data, meta? }` atau `{ ok: false, error }`.

---

## 📊 ER-D Ringkas

```
KATEGORI ─┐
LOKASI ───┼─< ASET >─┬─ PEMINJAMAN
SUMBER_DANA┘          ├─ MUTASI
GUDANG_TRANSIT ───────┤─ SERVIS (Kuratif/Preventif)
                      ├─ PENYUSUTAN
                      ├─ PENGHAPUSAN
                      └─ DOKUMEN
Verifikasi (stock opname) → OPNAME_ITEM
USERS → AUDIT_TRAIL (semua perubahan tercatat)
```

---

## 🧪 QA

QA end-to-end 11 titik lulus: login, dashboard, CRUD aset (create/detail/update/delete), RBAC (petugas ditolak hapus master), penyusutan, KIR, audit trail pagination.

---

## 📄 Lisensi

Dibuat untuk tugas mata kuliah Pemrograman Web II.