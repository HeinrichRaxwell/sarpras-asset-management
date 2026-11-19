-- Natural key untuk master data. Tanpa ini INSERT OR IGNORE tidak menolak
-- duplikat dan seed yang dijalankan ulang akan menggandakan baris.
-- Dipisah dari 0001 karena tabel production sudah dibuat sebelum UNIQUE ditambahkan;
-- SQLite tidak bisa ALTER kolom menjadi UNIQUE, jadi memakai unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kategori_nama ON kategori(nama);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sumber_dana_nama ON sumber_dana(nama);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lokasi_nama ON lokasi(nama);