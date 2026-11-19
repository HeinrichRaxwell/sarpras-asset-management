-- Akun demo read-only. Flag dipaksa di middleware, bukan disembunyikan di UI,
-- sehingga request tulis tetap ditolak walau dikirim langsung ke API.
ALTER TABLE users ADD COLUMN read_only INTEGER NOT NULL DEFAULT 0;