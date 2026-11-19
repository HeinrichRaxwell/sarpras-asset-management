import { Hono } from 'hono';
import { z } from 'zod';
import { validate, getPagination, paginationMeta, buildWhere, HttpError, parseId } from '../helpers.js';
import { audit, assetLog } from '../auth.js';

const JENIS = ['Kuratif', 'Preventif'];
const STATUS = ['Antri', 'Proses', 'Selesai'];
const KONDISI = ['Baik', 'Rusak Ringan', 'Rusak Berat'];

const createSchema = z.object({
  aset_kode: z.string().min(1, 'Kode aset wajib diisi'),
  jenis: z.enum(JENIS, { message: 'Jenis servis tidak valid' }),
  tanggal: z.string().optional(),
  jadwal_berikutnya: z.string().optional().nullable(),
  masalah: z.string().optional().nullable(),
  tindakan: z.string().optional().nullable(),
  biaya: z.coerce.number().min(0).optional(),
  vendor: z.string().max(120).optional().nullable(),
});

const updateSchema = z.object({
  status: z.enum(STATUS, { message: 'Status servis tidak valid' }).optional(),
  jadwal_berikutnya: z.string().optional().nullable(),
  masalah: z.string().optional().nullable(),
  tindakan: z.string().optional().nullable(),
  biaya: z.coerce.number().min(0).optional(),
  vendor: z.string().max(120).optional().nullable(),
  kondisi_akhir: z.enum(KONDISI).optional(),
});

export function servisRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  r.get('/', async (c) => {
    const q = c.req.query();
    const { limit, offset, page } = getPagination(q);
    const conditions = [];
    if (q.jenis) conditions.push({ sql: 's.jenis = ?', value: String(q.jenis) });
    if (q.status) conditions.push({ sql: 's.status = ?', value: String(q.status) });
    if (q.aset_kode) conditions.push({ sql: 's.aset_kode = ?', value: String(q.aset_kode) });
    const term = (q.search || q.q || '').trim();
    if (term) conditions.push({ sql: "(s.masalah ILIKE ? OR COALESCE(s.vendor,'') ILIKE ?)", value: `%${term}%`, repeat: 2 });
    const { where, params } = buildWhere(conditions);

    const total = (await db.query(`SELECT COUNT(*) AS t FROM servis s ${where}`, params)).rows[0].t;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT s.*, a.nama AS aset_nama FROM servis s
       LEFT JOIN aset a ON a.kode = s.aset_kode
       ${where} ORDER BY s.tanggal DESC, s.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return c.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'), 'Servis');
    const { rows } = await db.query(
      `SELECT s.*, a.nama AS aset_nama FROM servis s
       LEFT JOIN aset a ON a.kode = s.aset_kode WHERE s.id = $1`,
      [id]
    );
    if (!rows[0]) throw new HttpError(404, 'Servis tidak ditemukan');
    return c.json({ ok: true, data: rows[0] });
  });

  r.post('/', writeAuth, async (c) => {
    const { value: b } = validate(createSchema, await c.req.json().catch(() => ({})));
    const aset = (await db.query('SELECT kode FROM aset WHERE kode = $1', [b.aset_kode])).rows[0];
    if (!aset) throw new HttpError(404, 'Aset tidak ditemukan');

    const { rows } = await db.query(
      `INSERT INTO servis (aset_kode, jenis, tanggal, jadwal_berikutnya, masalah, tindakan, biaya, vendor)
       VALUES ($1,$2,COALESCE($3, date('now')),$4,$5,$6,$7,$8) RETURNING *`,
      [b.aset_kode, b.jenis, b.tanggal || null, b.jadwal_berikutnya || null, b.masalah || null,
       b.tindakan || null, b.biaya || 0, b.vendor || null]
    );
    const created = rows[0];
    if (b.jenis === 'Kuratif') {
      await db.query(`UPDATE aset SET status = 'Servis' WHERE kode = $1`, [b.aset_kode]);
    }

    await audit(db, c, 'servis', created.id, 'CREATE', null, created);
    await assetLog(db, b.aset_kode, b.jenis === 'Kuratif' ? 'Servis Kuratif' : 'Servis Preventif',
      c.get('user').username, { servis_id: created.id });
    return c.json({ ok: true, data: created }, 201);
  });

  r.patch('/:id', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Servis');
    const { value: b } = validate(updateSchema, await c.req.json().catch(() => ({})));
    const before = (await db.query('SELECT * FROM servis WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Servis tidak ditemukan');
    const merged = { ...before, ...b };
    const selesaiKuratif = b.status === 'Selesai' && before.jenis === 'Kuratif';

    await db.withTransaction(async (client) => {
      await client.query(
        `UPDATE servis SET status=$1, jadwal_berikutnya=$2, masalah=$3, tindakan=$4, biaya=$5, vendor=$6
         WHERE id=$7`,
        [merged.status, merged.jadwal_berikutnya || null, merged.masalah || null, merged.tindakan || null,
         merged.biaya, merged.vendor || null, id]
      );
      if (selesaiKuratif) {
        await client.query(`UPDATE aset SET status = 'Aktif', kondisi = $1 WHERE kode = $2`,
          [b.kondisi_akhir || 'Baik', before.aset_kode]);
      }
    });
    const updated = (await db.query('SELECT * FROM servis WHERE id = $1', [id])).rows[0];

    await audit(db, c, 'servis', id, 'UPDATE', before, updated);
    if (b.status === 'Selesai') {
      await assetLog(db, updated.aset_kode, 'Servis Selesai', c.get('user').username,
        { servis_id: updated.id, jenis: updated.jenis, kondisi_akhir: b.kondisi_akhir || 'Baik' });
    }
    return c.json({ ok: true, data: updated });
  });

  r.patch('/:id/status', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Servis');
    const body = await c.req.json().catch(() => ({}));
    const status = body?.status;
    if (!status) throw new HttpError(400, 'Status wajib diisi');
    if (!STATUS.includes(status)) throw new HttpError(400, 'Status servis tidak valid');

    const before = (await db.query('SELECT * FROM servis WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Servis tidak ditemukan');

    await db.withTransaction(async (client) => {
      await client.query('UPDATE servis SET status=$1 WHERE id=$2', [status, id]);
      if (status === 'Selesai' && before.jenis === 'Kuratif') {
        await client.query(`UPDATE aset SET status='Aktif' WHERE kode=$1`, [before.aset_kode]);
      }
    });
    const updated = (await db.query('SELECT * FROM servis WHERE id = $1', [id])).rows[0];

    // Backend asli memakai 'UPDATE_STATUS' yang melanggar CHECK audit_trail.aksi
    await audit(db, c, 'servis', id, 'UPDATE', before, updated);
    return c.json({ ok: true, data: updated });
  });

  return r;
}