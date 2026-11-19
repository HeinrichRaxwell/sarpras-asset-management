// Seed D1 harus jalan di SQLite nyata dan menghasilkan angka yang sama
// dengan seed PostgreSQL. Dijalankan sebelum apply ke production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
db.exec(readFileSync(new URL('../migrations/0002_seed.sql', import.meta.url), 'utf8'));

const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const expect = { users: 3, kategori: 8, sumber_dana: 6, lokasi: 11, gudang_transit: 4, aset: 8, peminjaman: 1, servis: 2, penyusutan: 3 };
for (const [t, n] of Object.entries(expect)) {
  assert.equal(count(t), n, `${t} harus ${n}`);
  console.log(`OK  ${t} = ${n}`);
}

// idempoten: menjalankan seed dua kali tidak boleh menambah baris atau error
db.exec(readFileSync(new URL('../migrations/0002_seed.sql', import.meta.url), 'utf8'));
for (const [t, n] of Object.entries(expect)) assert.equal(count(t), n, `${t} harus tetap ${n} setelah seed ulang`);
console.log('OK  seed idempoten (INSERT OR IGNORE)');

// AUTOINCREMENT harus lanjut setelah seed memakai id eksplisit (bug setval di PG)
db.exec(`INSERT INTO lokasi (nama, gedung) VALUES ('Ruang Baru', 'Gedung B')`);
const newId = db.prepare(`SELECT MAX(id) AS m FROM lokasi`).get().m;
assert.equal(newId, 12, 'id baru harus 12, bukan bentrok dengan seed id 1..11');
console.log('OK  autoincrement lanjut setelah seed id eksplisit (id baru = 12)');

// relasi FK utuh
const orphan = db.prepare(`SELECT COUNT(*) AS n FROM aset a LEFT JOIN kategori k ON k.id=a.kategori_id WHERE k.id IS NULL`).get().n;
assert.equal(orphan, 0);
console.log('OK  tidak ada aset yatim (FK kategori utuh)');

// gudang_transit terhubung ke aset hasil QC
const linked = db.prepare(`SELECT aset_kode FROM gudang_transit WHERE nama_barang='Printer Epson L3250'`).get().aset_kode;
assert.equal(linked, 'AM-2024-0001');
console.log('OK  gudang_transit tertaut ke aset AM-2024-0001');

// total nilai perolehan harus cocok dengan penjumlahan seed
const total = db.prepare(`SELECT SUM(nilai_perolehan) AS s FROM aset`).get().s;
assert.equal(total, 18500000 + 6500000 + 62000000 + 1850000 + 4800000 + 195000000 + 2450000 + 3200000);
console.log('OK  total nilai perolehan =', total);

console.log('\nSEED D1 VALID');