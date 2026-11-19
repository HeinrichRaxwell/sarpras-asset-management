import { Hono } from 'hono';
import { z } from 'zod';
import { masterRoutes } from './master.js';

export function kategoriRoutes(ctx) {
  return masterRoutes({
    ...ctx,
    table: 'kategori',
    label: 'Kategori',
    searchSql: 'nama ILIKE ?',
    columns: ['id', 'nama', 'deskripsi', 'umur_ekonomis_tahun', 'persen_penyusutan', 'akun_penyusutan'],
    schema: z.object({
      nama: z.string().min(1, 'Nama kategori wajib diisi').max(100),
      deskripsi: z.string().optional().nullable(),
      umur_ekonomis_tahun: z.coerce.number().int().positive('Umur ekonomis harus > 0').optional(),
      persen_penyusutan: z.coerce.number().positive('Persen penyusutan harus > 0').max(100, 'Persen penyusutan maksimal 100').optional(),
      akun_penyusutan: z.string().max(20).optional().nullable(),
    }),
    usage: {
      sql: 'SELECT COUNT(*) AS t FROM aset WHERE kategori_id = $1',
      message: (n) => `masih dipakai oleh ${n} aset, tidak dapat dihapus`,
    },
  });
}

export function sumberDanaRoutes(ctx) {
  return masterRoutes({
    ...ctx,
    table: 'sumber_dana',
    label: 'Sumber dana',
    searchSql: "(nama ILIKE ? OR COALESCE(kode,'') ILIKE ?)",
    searchRepeat: 2,
    columns: ['id', 'nama', 'kode', 'tahun_anggaran', 'ketentuan_penghapusan'],
    schema: z.object({
      nama: z.string().min(1, 'Nama sumber dana wajib diisi').max(80),
      kode: z.string().max(20).optional().nullable(),
      tahun_anggaran: z.coerce.number().int().optional().nullable(),
      ketentuan_penghapusan: z.string().optional().nullable(),
    }),
    usage: {
      sql: 'SELECT COUNT(*) AS t FROM aset WHERE sumber_dana_id = $1',
      message: (n) => `masih dipakai oleh ${n} aset, tidak dapat dihapus`,
    },
  });
}