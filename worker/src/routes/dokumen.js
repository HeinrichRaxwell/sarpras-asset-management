import { Hono } from 'hono';
import { z } from 'zod';
import { validate, HttpError, parseId } from '../helpers.js';
import { audit } from '../auth.js';

const JENIS = ['Faktur', 'BAST', 'Kwitansi', 'Garansi', 'Lainnya'];

const schema = z.object({
  jenis: z.enum(JENIS, { message: 'Jenis dokumen tidak valid' }),
  nama_file: z.string().min(1, 'Nama file wajib diisi').max(255),
  url: z.string().min(1, 'URL wajib diisi').max(2000),
});

export function dokumenRoutes({ db, auth }) {
  const r = new Hono();
  r.use('*', auth.authenticate);
  const writeAuth = auth.authorize('admin', 'petugas');

  // Path dibedakan eksplisit: backend Express menaruh GET /:asetKode dan
  // DELETE /:id pada pola yang sama sehingga kode aset bisa masuk handler id.
  r.get('/aset/:asetKode', async (c) => {
    const kode = c.req.param('asetKode');
    const asset = (await db.query('SELECT kode FROM aset WHERE kode = $1', [kode])).rows[0];
    if (!asset) throw new HttpError(404, 'Aset tidak ditemukan');
    const { rows } = await db.query(
      `SELECT d.*, u.nama AS diunggah_oleh_nama FROM dokumen d
       LEFT JOIN users u ON u.id = d.diunggah_oleh
       WHERE d.aset_kode = $1 ORDER BY d.unggah_pada DESC`,
      [kode]
    );
    return c.json({ ok: true, data: rows });
  });

  r.post('/aset/:asetKode', writeAuth, async (c) => {
    const kode = c.req.param('asetKode');
    const { value: b } = validate(schema, await c.req.json().catch(() => ({})));
    const asset = (await db.query('SELECT kode FROM aset WHERE kode = $1', [kode])).rows[0];
    if (!asset) throw new HttpError(404, 'Aset tidak ditemukan');

    const { rows } = await db.query(
      `INSERT INTO dokumen (aset_kode, jenis, nama_file, url, diunggah_oleh)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [kode, b.jenis, b.nama_file, b.url, c.get('user').id]
    );
    await audit(db, c, 'dokumen', rows[0].id, 'CREATE', null, rows[0]);
    return c.json({ ok: true, data: rows[0] }, 201);
  });

  r.delete('/:id', writeAuth, async (c) => {
    const id = parseId(c.req.param('id'), 'Dokumen');
    const before = (await db.query('SELECT * FROM dokumen WHERE id = $1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Dokumen tidak ditemukan');
    await db.query('DELETE FROM dokumen WHERE id = $1', [id]);
    await audit(db, c, 'dokumen', id, 'DELETE', before, null);
    return c.json({ ok: true, data: { id } });
  });

  return r;
}