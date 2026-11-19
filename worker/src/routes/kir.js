import { Hono } from 'hono';
import { HttpError, parseId } from '../helpers.js';

export function kirRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);

  r.get('/:lokasiId', async (c) => {
    const lokasiId = parseId(c.req.param('lokasiId'), 'ID lokasi');
    const q = c.req.query();
    const year = parseInt(q.year, 10) || new Date().getFullYear();

    const lokasi = (await db.query('SELECT * FROM lokasi WHERE id = $1', [lokasiId])).rows[0];
    if (!lokasi) throw new HttpError(404, 'Lokasi tidak ditemukan');

    const { rows } = await db.query(
      `SELECT kode, nama, merk, tipe,
              CAST(strftime('%Y', tanggal_perolehan) AS INTEGER) AS tahun,
              1 AS jumlah,
              nilai_perolehan AS nilai,
              kondisi, status,
              (SELECT nama FROM kategori WHERE id = aset.kategori_id) AS kategori,
              CASE
                WHEN kondisi <> 'Baik' THEN 'Kondisi: ' || kondisi
                WHEN status <> 'Aktif' THEN 'Status: ' || status
                ELSE NULL
              END AS keterangan
       FROM aset
       WHERE lokasi_id = $1 AND status <> 'Dihapus'
         AND CAST(strftime('%Y', tanggal_perolehan) AS INTEGER) = $2
       ORDER BY kategori, kode`,
      [lokasiId, year]
    );

    if (q.format === 'csv') {
      const header = ['Kode', 'Nama', 'Merk', 'Tipe', 'Tahun', 'Jumlah', 'Nilai', 'Kategori', 'Keterangan'];
      const esc = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [header.join(',')];
      for (const x of rows) {
        lines.push([x.kode, x.nama, x.merk, x.tipe, x.tahun, x.jumlah, x.nilai, x.kategori, x.keterangan].map(esc).join(','));
      }
      const fileName = `KIR_${lokasi.nama.replace(/[^\w\-]+/g, '_')}_${year}.csv`;
      return new Response('\ufeff' + lines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    return c.json({
      ok: true,
      data: {
        lokasi,
        tahun: year,
        items: rows,
        total_jumlah: rows.reduce((s, x) => s + Number(x.jumlah), 0),
        total_nilai: rows.reduce((s, x) => s + Number(x.nilai || 0), 0),
      },
    });
  });

  return r;
}