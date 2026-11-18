-- =====================================================================
-- SEED DATA AWAL
-- Default credentials (HANYA untuk development/local):
--   admin    / admin123
--   petugas  / petugas123
--   pimpinan / pimpinan123
-- Hash bcrypt (rounds 12) di bawah SUDAH diverifikasi via bcrypt.compare().
-- GANTI password ini segera pada deployment production.
-- =====================================================================

INSERT INTO users (username, password_hash, nama, email, role) VALUES
('admin',    '$2b$12$H/ncl5K.ozUbpV0Zon0Ux.Rlc6PDqPLfi6qbEazYqYEyOVbDKpobq', 'Administrator Sistem', 'admin@sarpras.local',    'admin'),
('petugas',  '$2b$12$udBG6Il8sj5EjJozKTJIGOncNdqXDsdB6uZ.FwGnvXEsvSO2uq.jW', 'Petugas Sarpras',      'petugas@sarpras.local',  'petugas'),
('pimpinan', '$2b$12$DQ1MHFMu1uo4AtJfFr.ms.yTAtx4Xjp8sEgfSKF1NDZH1vdvXA04W', 'Kepala Bagian Umum',   'pimpinan@sarpras.local', 'pimpinan')
ON CONFLICT (username) DO NOTHING;

-- Kategori aset (umur ekonomis & persen penyusutan garis lurus)
INSERT INTO kategori (nama, deskripsi, umur_ekonomis_tahun, persen_penyusutan, akun_penyusutan) VALUES
('Elektronik',   'Komputer, printer, proyektor, perangkat jaringan', 4, 25.00, '1.2.3.01'),
('Meubelair',    'Meja, kursi, lemari, rak arsip',                   10, 10.00, '1.2.3.02'),
('Kendaraan',    'Mobil dinas, motor dinas',                          8, 12.50, '1.2.3.03'),
('Peralatan Kantor','Mesin ketik, mesin hitung, fax',                 5, 20.00, '1.2.3.04'),
('Bangunan',     'Gedung dan bangunan permanen',                     20,  5.00, '1.2.3.05'),
('Jaringan',     'Perangkat jaringan dan server',                    5, 20.00, '1.2.3.06'),
('AV & Presentasi','Proyektor, sound system, layar',                 5, 20.00, '1.2.3.07'),
('Alat Kebersihan','Mesin pemotong rumput, vacuum',                  6, 16.67, '1.2.3.08')
ON CONFLICT DO NOTHING;

-- Sumber dana
INSERT INTO sumber_dana (nama, kode, tahun_anggaran, ketentuan_penghapusan) VALUES
('APBN', 'APBN', 2024, 'Wajib persetujuan Kementerian/Biro Umum sebelum dilelang atau dimusnahkan'),
('APBD', 'APBD', 2024, 'Wajib persetujuan Kepala Daerah / Sekretaris Daerah'),
('Hibah', 'HBH', 2024, 'Tidak boleh dilelang tanpa persetujuan pemberi hibah'),
('BOS', 'BOS', 2024, 'Wajib laporan ke komite sekolah / yayasan'),
('Wakaf', 'WKF', 2024, 'Haram dilelang; hanya boleh dialihkan ke nazhir lain'),
('Bantuan Pemerintah', 'BANPRES', 2024, 'Mengikuti ketentuan lembaga pemberi bantuan')
ON CONFLICT (kode) DO NOTHING;

-- Lokasi (hierarki: Gedung > Lantai > Ruang)
INSERT INTO lokasi (id, nama, gedung, lantai, penanggung_jawab, parent_id) VALUES
(1, 'Gedung A - Kantor Pusat', 'Gedung A', NULL, 'Kepala Bagian Umum', NULL),
(2, 'Lantai 1', 'Gedung A', 'Lantai 1', 'Koordinator Lantai 1', 1),
(3, 'Lantai 2', 'Gedung A', 'Lantai 2', 'Koordinator Lantai 2', 1),
(4, 'Lantai 3', 'Gedung A', 'Lantai 3', 'Koordinator Lantai 3', 1),
(5, 'Ruang 101 - Server', 'Gedung A', 'Lantai 1', 'Admin Jaringan', 2),
(6, 'Ruang 102 - Arsip', 'Gedung A', 'Lantai 1', 'Petugas Arsip', 2),
(7, 'Ruang 201 - Keuangan', 'Gedung A', 'Lantai 2', 'Kepala Keuangan', 3),
(8, 'Ruang 202 - HRD', 'Gedung A', 'Lantai 2', 'Kepala HRD', 3),
(9, 'Ruang 301 - Rapat', 'Gedung A', 'Lantai 3', 'Sekretaris', 4),
(10, 'Gudang Utama', 'Gedung Gudang', 'Lantai Dasar', 'Petugas Gudang', NULL),
(11, 'Gudang Transit (QC)', 'Gedung Gudang', 'Lantai Dasar', 'Petugas QC', NULL)
ON CONFLICT (id) DO NOTHING;

-- Gudang transit (QC) — barang masuk menunggu verifikasi
INSERT INTO gudang_transit (nama_barang, pengirim, tgl_terima, qty, qc_status, catatan_qc) VALUES
('Laptop Lenovo ThinkPad T14', 'Procurement IT', CURRENT_DATE - 3, 5, 'Menunggu', NULL),
('Printer Epson L3250', 'Procurement Umum', CURRENT_DATE - 2, 3, 'Menunggu', NULL),
('AC Split 1.5 PK Daikin', 'Vendor HVAC', CURRENT_DATE - 1, 2, 'Lolos', 'Sesuai spesifikasi PO'),
('Meja Kerja Modera 120x60', 'Vendor Meubel', CURRENT_DATE, 10, 'Menunggu', NULL)
ON CONFLICT DO NOTHING;

-- Aset contoh (data riil-tipe, bukan placeholder generik)
INSERT INTO aset (kode, nama, kategori_id, lokasi_id, sumber_dana_id, merk, tipe, no_seri, tanggal_perolehan, nilai_perolehan, kondisi, status) VALUES
('AM-2023-0001', 'Laptop Lenovo ThinkPad T14 Gen 3', 1, 5, 1, 'Lenovo', 'ThinkPad T14', 'PF-3XK9T1', '2023-03-15', 18500000, 'Baik', 'Aktif'),
('AM-2023-0002', 'Proyektor Epson EB-X500', 7, 9, 1, 'Epson', 'EB-X500', 'EP-X5-99281', '2023-04-20', 6500000, 'Baik', 'Dipinjam'),
('AM-2022-0007', 'Server Dell PowerEdge R750', 6, 5, 1, 'Dell', 'PowerEdge R750', 'SVR-2022-1188', '2022-08-10', 62000000, 'Baik', 'Aktif'),
('AM-2022-0015', 'Meja Kerja Modera 120x60', 2, 7, 2, 'Modera', 'MD-120', NULL, '2022-01-12', 1850000, 'Baik', 'Aktif'),
('AM-2021-0033', 'AC Split Daikin 1.5 PK', 1, 8, 3, 'Daikin', 'FTKQ25', 'DK-2021-4471', '2021-11-05', 4800000, 'Rusak Ringan', 'Servis'),
('AM-2020-0051', 'Mobil Dinas Toyota Avanza', 3, 10, 2, 'Toyota', 'Avanza 1.3 E', 'B-1872-XY', '2020-06-18', 195000000, 'Baik', 'Aktif'),
('AM-2024-0001', 'Printer Epson L3250', 1, 6, 4, 'Epson', 'L3250', 'EP-L32-77120', '2024-01-22', 2450000, 'Baik', 'Aktif'),
('AM-2019-0088', 'Lemari Arsip Besi 4 Pintu', 2, 6, 2, 'Brother', 'LB-4P', NULL, '2019-09-30', 3200000, 'Baik', 'Aktif')
ON CONFLICT (kode) DO NOTHING;

-- Gudang transit item yang sudah lolos → dijadikan aset
UPDATE gudang_transit SET aset_kode = 'AM-2024-0001' WHERE nama_barang = 'Printer Epson L3250';

-- Peminjaman aktif
INSERT INTO peminjaman (aset_kode, peminjam, unit, keperluan, tgl_pinjam, tgl_kembali_rencana, status) VALUES
('AM-2023-0002', 'Budi Santoso', 'Bagian Humas', 'Rapat koordinasi wilayah', CURRENT_DATE - 2, CURRENT_DATE + 1, 'Dipinjam')
ON CONFLICT DO NOTHING;

-- Servis preventif & kuratif
INSERT INTO servis (aset_kode, jenis, tanggal, jadwal_berikutnya, masalah, tindakan, biaya, vendor, status) VALUES
('AM-2021-0033', 'Kuratif', CURRENT_DATE - 1, NULL, 'Tidak dingin, indikator error F5', 'Pengecekan freon & PCB indoor', 450000, 'CV Teknik Dingin', 'Proses'),
('AM-2023-0001', 'Preventif', CURRENT_DATE - 30, CURRENT_DATE + 60, NULL, 'Pembersihan kipas & update OS', 150000, 'IT Support Internal', 'Selesai')
ON CONFLICT DO NOTHING;

-- Penyusutan (garis lurus) contoh tahun berjalan
INSERT INTO penyusutan (aset_kode, tahun, metode, nilai_awal, beban_tahunan, akumulasi, nilai_buku) VALUES
('AM-2023-0001', 2024, 'Garis Lurus', 18500000, 4625000, 4625000, 13875000),
('AM-2022-0007', 2024, 'Garis Lurus', 62000000, 12400000, 24800000, 37200000),
('AM-2022-0015', 2024, 'Garis Lurus', 1850000, 185000, 370000, 1480000)
ON CONFLICT (aset_kode, tahun) DO NOTHING;

-- Sinkronkan sequence SEMUA tabel ber-kolom id (seed memakai id eksplisit,
-- tanpa ini INSERT baru akan gagal 409 duplicate key)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['lokasi','kategori','sumber_dana','pengguna','verifikasi',
    'opname_item','verifikasi_item','dokumen','mutasi','servis','penyusutan','peminjaman','penghapusan'])
  LOOP
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT MAX(id) FROM %I), 1))', t, 'id', t);
  END LOOP;
END $$;