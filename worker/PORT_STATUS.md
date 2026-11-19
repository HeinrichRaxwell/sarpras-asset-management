# SARPRAS di Cloudflare Workers + D1 — SELESAI & LIVE

## URL production

| Layanan | URL | Status |
|---|---|---|
| Aplikasi | https://sarpras.heinrichraxwell.my.id | live, TLS valid |
| Workers.dev | https://sarpras.reydav0509.workers.dev | live |
| Galeri portofolio | https://heinrichraxwell.my.id/#projects | entri `sarpras`, 15 screenshot |

## Resource Cloudflare

| Item | Nilai |
|---|---|
| Akun | `9ea7009a5bcaaecff9100c2ba5c09dbe` (Reydav0509@gmail.com) |
| Zone | `heinrichraxwell.my.id` = `814042d4098b99d2420cec031300263d` |
| Worker | `sarpras`, version `65aaafcf-400c-4867-968d-5a96f14bfe01` |
| D1 | `sarpras-db` = `bd3e8d59-e3ed-4464-9be0-4cd703b90906` (APAC) |
| Worker domain | `8b4460cb202b20f1bf126a970da747e2ea4eae87` |
| Pages portfolio | `heinrich-raxwell-portfolio` |

Secrets Worker: `JWT_SECRET`, `JWT_EXPIRES`, `BCRYPT_ROUNDS` (diset via `wrangler secret bulk`, file plaintext sudah dihapus).

## Akun

| Username | Password | Akses |
|---|---|---|
| `Raxwell` | (rahasia owner) | penuh — owner tunggal |
| `demo-admin` | `demo-admin123` | pratinjau, read-only |
| `demo-petugas` | `demo-petugas123` | pratinjau, read-only |
| `demo-pimpinan` | `demo-pimpinan123` | pratinjau, read-only |

Password owner tidak disimpan di repo. Akun lama (`admin`/`petugas`/`pimpinan`) sudah dihapus.
Ketiga akun pratinjau tercantum di bawah form login beserta catatan pembatasannya.

Read-only dipaksa di **server**: `authenticate` membaca flag dari DB tiap request,
middleware menolak semua metode tulis, dan `authorize()` menolak sebagai lapis kedua.
UI menyembunyikan tombol tulis lewat `can('write')` — bukan sekadar disabled.

Verifikasi: `python qa_accounts.py <creds.json>` (104 cek) dan
`node qa_ui_readonly.cjs <creds.json> <ownerPassword>` (68 cek, 16 halaman × 4 akun).

## Verifikasi

- `python qa_worker.py https://sarpras.heinrichraxwell.my.id` → **66/66 PASS**
- `node test/db.test.mjs` → adapter pg→D1 lolos
- `node test/sql.test.mjs` → translator PG→SQLite lolos
- `node test/jwt.test.mjs` → interop dua arah dengan `jsonwebtoken` asli
- `node test/schema_sqlite.test.mjs` → 16 tabel + 11 query asli jalan di SQLite nyata
- `node test/seed.test.mjs` → seed idempoten

Data production == seed: users 3, kategori 8, sumber_dana 6, lokasi 11,
gudang_transit 4, aset 8, peminjaman 1, servis 2, penyusutan 3, total nilai 294.300.000.
Semua sisa data smoke test (prefix `QA-`) sudah dibersihkan — counter QA = 0 di semua tabel.

## Arsitektur

Satu Worker melayani SPA (static assets) dan API (`run_worker_first = ["/api/*"]`),
jadi same-origin: tanpa CORS, token tidak lintas domain.

- `src/db.js` — adapter `$n`→`?`, reorder parameter berulang, `withTransaction` via `batch()` atomik
- `src/sql.js` — translator dialek: `FILTER`, cast `::`, `ILIKE`, `NOW()`, `SUBSTRING FROM`,
  `date_trunc`, `to_char`, `INTERVAL`, `EXTRACT`, boolean di luar string literal
- `src/jwt.js` — HS256 WebCrypto (ganti `jsonwebtoken` yang butuh Node crypto)
- `src/routes/*` — 18 modul Hono
- `frontend-react/public/_headers` — security headers untuk static assets

`DISTINCT ON` (dashboard) tidak bisa di-translate regex → ditulis ulang memakai
`ROW_NUMBER() OVER (PARTITION BY aset_kode ORDER BY tahun DESC)`.

## Bug backend asli yang ikut diperbaiki saat porting

| Lokasi | Masalah | Perbaikan |
|---|---|---|
| `servis.js` PATCH status | audit aksi `'UPDATE_STATUS'` melanggar CHECK constraint | pakai `'UPDATE'` |
| `mutasi.js` approve | audit aksi `'APPROVE'` melanggar CHECK | pakai `'UPDATE'` |
| `penghapusan.js` approve | baca `result.sumber_dana_id` yang tak pernah ada → ketentuan selalu null | baca dari `asset.sumber_dana_id` |
| `dokumen.js` | `GET /:asetKode` dan `DELETE /:id` berebut pola route | path eksplisit `/aset/:asetKode` |
| seed | `INSERT OR IGNORE` tanpa UNIQUE menggandakan baris saat seed ulang | unique index natural key (`0003`) |

## Catatan operasional

- Token MCP Cloudflare **tidak berlaku** untuk REST API langsung (401) — pakai MCP tool.
- D1 menolak compound SELECT panjang (`too many terms in compound SELECT`) — pakai subquery scalar.
- `wrangler` dan MCP Cloudflare adalah kredensial terpisah; keduanya harus di akun yang sama.
- Beberapa akun terlihat oleh wrangler → set `CLOUDFLARE_ACCOUNT_ID` saat deploy Pages.
- Static assets di-serve langsung oleh layer assets, melewati Worker: header harus lewat `_headers`,
  bukan middleware Hono.

## Deploy ulang

```bash
cd frontend-react && npm run build
cd ../worker && npx wrangler deploy
```

Migrasi D1: `npx wrangler d1 migrations apply sarpras-db --remote`