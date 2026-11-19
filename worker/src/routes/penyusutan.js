import { Hono } from 'hono';
import { z } from 'zod';
import { validate, HttpError } from '../helpers.js';
import { audit } from '../auth.js';

const computeSchema = z.object({
  tahun: z.coerce.number().int().min(2000).max(2100, 'Tahun tidak valid'),
  metode: z.enum(['Garis Lurus', 'Saldo Menurun']).optional(),
});

export function penyusutanRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);

  r.get('/', async (c) => {
    const year = parseInt(c.req.query('year'), 10) || new Date().getFullYear();
    const { rows } = await db.query(
      `SELECT p.*, a.nama AS aset_nama, k.nama AS kategori_nama
       FROM penyusutan p
       LEFT JOIN aset a ON a.kode = p.aset_kode
       LEFT JOIN kategori k ON k.id = a.kategori_id
       WHERE p.tahun = $1 ORDER BY p.aset_kode`,
      [year]
    );
    return c.json({ ok: true, data: rows, meta: { tahun: year, total: rows.length } });
  });

  r.get('/:kode', async (c) => {
    const kode = c.req.param('kode');
    const aset = (await db.query('SELECT * FROM aset WHERE kode = $1', [kode])).rows[0];
    if (!aset) throw new HttpError(404, 'Aset tidak ditemukan');
    const kategori = (await db.query('SELECT * FROM kategori WHERE id = $1', [aset.kategori_id])).rows[0];
    const { rows } = await db.query('SELECT * FROM penyusutan WHERE aset_kode = $1 ORDER BY tahun ASC', [kode]);
    return c.json({
      ok: true,
      data: { aset, kategori, umur_ekonomis_tahun: kategori?.umur_ekonomis_tahun || 5, jadwal: rows },
    });
  });

  r.post('/compute', auth.authorize('admin', 'petugas'), async (c) => {
    const { value } = validate(computeSchema, await c.req.json().catch(() => ({})));
    const { tahun, metode } = value;
    const method = metode || 'Garis Lurus';

    const assets = (await db.query(
      `SELECT a.*, k.umur_ekonomis_tahun, k.persen_penyusutan
       FROM aset a LEFT JOIN kategori k ON k.id = a.kategori_id
       WHERE a.status = 'Aktif'`
    )).rows;

    // Akumulasi tahun sebelumnya dibaca sekali untuk semua aset, bukan per aset
    // di dalam loop, supaya jumlah query tidak tumbuh linear.
    const prevRows = (await db.query('SELECT aset_kode, akumulasi FROM penyusutan WHERE tahun = $1', [tahun - 1])).rows;
    const prevMap = new Map(prevRows.map((x) => [x.aset_kode, Number(x.akumulasi)]));

    const computed = [];
    for (const a of assets) {
      const rate = Number(a.persen_penyusutan || 20) / 100;
      const akumulasiSebelumnya = prevMap.get(a.kode) || 0;
      const nilaiAwal = Number(a.nilai_perolehan || 0);
      const beban = method === 'Saldo Menurun'
        ? Math.max(0, (nilaiAwal - akumulasiSebelumnya) * rate)
        : nilaiAwal * rate;
      const akumulasi = Math.min(nilaiAwal, akumulasiSebelumnya + beban);
      const nilaiBuku = Math.max(0, nilaiAwal - akumulasi);

      const tahunPerolehan = new Date(a.tanggal_perolehan).getFullYear();
      const tahunKe = tahun - tahunPerolehan + 1;
      if (tahunKe <= 0 || (method === 'Garis Lurus' && tahunKe > a.umur_ekonomis_tahun)) continue;

      computed.push([a.kode, tahun, method, nilaiAwal,
        Number(beban.toFixed(2)), Number(akumulasi.toFixed(2)), Number(nilaiBuku.toFixed(2))]);
    }

    if (computed.length) {
      await db.withTransaction(async (client) => {
        for (const params of computed) {
          await client.query(
            `INSERT INTO penyusutan (aset_kode, tahun, metode, nilai_awal, beban_tahunan, akumulasi, nilai_buku)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (aset_kode, tahun) DO UPDATE SET
               metode = excluded.metode, nilai_awal = excluded.nilai_awal,
               beban_tahunan = excluded.beban_tahunan, akumulasi = excluded.akumulasi,
               nilai_buku = excluded.nilai_buku`,
            params
          );
        }
      });
    }

    const { rows: results } = await db.query(
      'SELECT * FROM penyusutan WHERE tahun = $1 ORDER BY aset_kode',
      [tahun]
    );
    await audit(db, c, 'penyusutan', String(tahun), 'CREATE', null, { tahun, jumlah: computed.length });
    return c.json({ ok: true, data: results, meta: { tahun, jumlah_dihitung: computed.length } });
  });

  return r;
}