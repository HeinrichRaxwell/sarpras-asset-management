import { Hono } from 'hono';
import { z } from 'zod';
import { validate, getPagination, paginationMeta, buildWhere, generateAsetKode, HttpError } from '../helpers.js';
import { audit, assetLog } from '../auth.js';

const STATUSES = ['Aktif', 'Dipinjam', 'Servis', 'Mutasi', 'Dihapus'];
const KONDISI = ['Baik', 'Rusak Ringan', 'Rusak Berat'];
const SORT_WHITELIST = new Set(['kode', 'nama', 'nilai_perolehan', 'tanggal_perolehan', 'dibuat_pada', 'status']);

const asetSchema = z.object({
  nama: z.string().min(1).max(200),
  kategori_id: z.coerce.number().int().positive(),
  lokasi_id: z.coerce.number().int().positive().optional().nullable(),
  sumber_dana_id: z.coerce.number().int().positive().optional().nullable(),
  merk: z.string().max(80).optional().nullable(),
  tipe: z.string().max(80).optional().nullable(),
  no_seri: z.string().max(80).optional().nullable(),
  tanggal_perolehan: z.string().optional(),
  nilai_perolehan: z.coerce.number().min(0).optional(),
  kondisi: z.enum(KONDISI).optional(),
  status: z.enum(STATUSES).optional(),
  foto_url: z.string().optional().nullable(),
});

const JOINED = `FROM aset a
  LEFT JOIN kategori k ON k.id = a.kategori_id
  LEFT JOIN lokasi l ON l.id = a.lokasi_id
  LEFT JOIN sumber_dana sd ON sd.id = a.sumber_dana_id`;
const SELECT_JOINED = 'a.*, k.nama AS kategori_nama, l.nama AS lokasi_nama, sd.nama AS sumber_dana_nama';

export function asetRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  async function validateRefs(d) {
    for (const [field, table, label] of [
      ['kategori_id', 'kategori', 'Kategori'],
      ['lokasi_id', 'lokasi', 'Lokasi'],
      ['sumber_dana_id', 'sumber_dana', 'Sumber dana'],
    ]) {
      if (!d[field]) continue;
      const x = await db.query(`SELECT id FROM ${table} WHERE id = $1`, [d[field]]);
      if (!x.rows[0]) throw new HttpError(400, `${label} tidak ditemukan`);
    }
  }

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q);
    const term = (q.search || q.q || '').trim();
    const conditions = [];
    if (term) {
      conditions.push({ sql: "(a.nama ILIKE ? OR a.kode ILIKE ? OR COALESCE(a.merk,'') ILIKE ?)", value: `%${term}%`, repeat: 3 });
    }
    if (q.kategori_id) conditions.push({ sql: 'a.kategori_id = ?', value: Number(q.kategori_id) });
    if (q.lokasi_id) conditions.push({ sql: 'a.lokasi_id = ?', value: Number(q.lokasi_id) });
    if (q.status) conditions.push({ sql: 'a.status = ?', value: String(q.status) });
    if (q.kondisi) conditions.push({ sql: 'a.kondisi = ?', value: String(q.kondisi) });

    const { where, params } = buildWhere(conditions);
    const sortCol = SORT_WHITELIST.has(q.sort) ? q.sort : 'dibuat_pada';
    const sortDir = q.order === 'asc' ? 'ASC' : 'DESC';

    const total = (await db.query(`SELECT COUNT(*) AS t FROM aset a ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT ${SELECT_JOINED} ${JOINED} ${where}
       ORDER BY a.${sortCol} ${sortDir}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/:kode/detail', async (c) => {
    const kode = c.req.param('kode');
    const { rows } = await db.query(`SELECT ${SELECT_JOINED} ${JOINED} WHERE a.kode = $1`, [kode]);
    if (!rows[0]) throw new HttpError(404, 'Aset tidak ditemukan');
    const aset = rows[0];
    const dokumen = (await db.query('SELECT * FROM dokumen WHERE aset_kode = $1 ORDER BY unggah_pada DESC', [kode])).rows;
    const penyusutan = (await db.query('SELECT * FROM penyusutan WHERE aset_kode = $1 ORDER BY tahun DESC LIMIT 1', [kode])).rows[0] || null;
    const peminjaman = (await db.query(
      `SELECT * FROM peminjaman WHERE aset_kode = $1 AND status = 'Dipinjam' ORDER BY tgl_pinjam DESC LIMIT 1`,
      [kode]
    )).rows[0] || null;
    const logs = (await db.query('SELECT * FROM asset_log WHERE aset_kode = $1 ORDER BY waktu DESC LIMIT 20', [kode])).rows;
    return c.json({ ok: true, data: { aset, dokumen, penyusutan, peminjaman, asset_log: logs } });
  });

  r.get('/:kode', async (c) => {
    const kode = c.req.param('kode');
    const { rows } = await db.query(`SELECT ${SELECT_JOINED} ${JOINED} WHERE a.kode = $1`, [kode]);
    if (!rows[0]) throw new HttpError(404, 'Aset tidak ditemukan');
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', writeAuth, async (c) => {
    const { value: b } = validate(asetSchema, await c.req.json().catch(() => ({})));
    await validateRefs(b);
    const kode = await generateAsetKode(db, new Date().getFullYear());

    // qr_token wajib diisi aplikasi: D1 tidak punya gen_random_uuid()
    await db.query(
      `INSERT INTO aset (kode, nama, kategori_id, lokasi_id, sumber_dana_id, merk, tipe, no_seri,
                         tanggal_perolehan, nilai_perolehan, kondisi, status, foto_url, qr_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, date('now')),$10,$11,$12,$13,$14)`,
      [kode, b.nama, b.kategori_id, b.lokasi_id || null, b.sumber_dana_id || null,
       b.merk || null, b.tipe || null, b.no_seri || null, b.tanggal_perolehan || null,
       b.nilai_perolehan ?? 0, b.kondisi || 'Baik', b.status || 'Aktif', b.foto_url || null,
       crypto.randomUUID()]
    );
    const created = (await db.query('SELECT * FROM aset WHERE kode = $1', [kode])).rows[0];

    await audit(db, c, 'aset', kode, 'CREATE', null, created);
    await assetLog(db, kode, 'Masuk', c.get('user').username, { nilai: created.nilai_perolehan });
    return c.json({ ok: true, data: created }, 201);
  });

  r.put('/:kode', writeAuth, async (c) => {
    const kode = c.req.param('kode');
    const { value: b } = validate(asetSchema.partial(), await c.req.json().catch(() => ({})));
    const before = (await db.query('SELECT * FROM aset WHERE kode = $1', [kode])).rows[0];
    if (!before) throw new HttpError(404, 'Aset tidak ditemukan');
    const merged = { ...before, ...b };
    await validateRefs(merged);

    await db.query(
      `UPDATE aset SET nama=$1, kategori_id=$2, lokasi_id=$3, sumber_dana_id=$4, merk=$5, tipe=$6,
                       no_seri=$7, tanggal_perolehan=$8, nilai_perolehan=$9, kondisi=$10, status=$11,
                       foto_url=$12, diupdate_pada=datetime('now')
       WHERE kode=$13`,
      [merged.nama, merged.kategori_id, merged.lokasi_id || null, merged.sumber_dana_id || null,
       merged.merk || null, merged.tipe || null, merged.no_seri || null,
       merged.tanggal_perolehan, merged.nilai_perolehan, merged.kondisi, merged.status,
       merged.foto_url || null, kode]
    );
    const updated = (await db.query('SELECT * FROM aset WHERE kode = $1', [kode])).rows[0];

    await audit(db, c, 'aset', kode, 'UPDATE', before, updated);
    await assetLog(db, kode, 'Update', c.get('user').username, { fields: Object.keys(b) });
    return c.json({ ok: true, data: updated });
  });

  r.delete('/:kode', auth.authorize('admin'), async (c) => {
    const kode = c.req.param('kode');
    const before = (await db.query('SELECT * FROM aset WHERE kode = $1', [kode])).rows[0];
    if (!before) throw new HttpError(404, 'Aset tidak ditemukan');

    if (c.req.query('hard') === 'true') {
      // Anak aset tidak ber-ON DELETE CASCADE semua; satu batch atomik agar
      // tidak ada sisa baris yatim bila salah satu statement gagal.
      await db.withTransaction(async (client) => {
        for (const t of ['dokumen', 'asset_log', 'opname_item', 'penyusutan', 'peminjaman', 'mutasi', 'servis', 'penghapusan']) {
          await client.query(`DELETE FROM ${t} WHERE aset_kode = $1`, [kode]);
        }
        await client.query('DELETE FROM aset WHERE kode = $1', [kode]);
      });
      await audit(db, c, 'aset', kode, 'DELETE', before, null);
      return c.json({ ok: true, data: { kode, hard: true } });
    }

    if (before.status === 'Dihapus') {
      throw new HttpError(409, 'Aset sudah berstatus Dihapus; gunakan ?hard=true untuk hapus permanen');
    }
    await db.query(`UPDATE aset SET status = 'Dihapus' WHERE kode = $1`, [kode]);
    const after = (await db.query('SELECT * FROM aset WHERE kode = $1', [kode])).rows[0];
    await audit(db, c, 'aset', kode, 'UPDATE', before, after);
    await assetLog(db, kode, 'Dihapus (soft)', c.get('user').username, { soft: true });
    return c.json({ ok: true, data: after });
  });

  return r;
}