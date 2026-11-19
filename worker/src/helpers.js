import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function validate(schema, data) {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, value: r.data };
  const detail = r.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
  throw new HttpError(400, `Validasi gagal: ${detail}`);
}

export function getPagination(q, defLimit = 20, maxLimit = 500) {
  const page = Math.max(1, parseInt(q?.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(q?.limit, 10) || defLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function generateAsetKode(db, year) {
  const y = year || new Date().getFullYear();
  const prefix = `AM-${y}-`;
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(CAST(SUBSTR(kode, ${prefix.length + 1}) AS INTEGER)), 0) AS mx
     FROM aset WHERE kode LIKE $1`,
    [prefix + '%']
  );
  const next = (rows[0]?.mx || 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// conditions: {sql, value, repeat?} dengan placeholder ? yang diganti $n
export function buildWhere(conditions) {
  const clauses = [];
  const params = [];
  for (const c of conditions) {
    if (c === null || c === undefined) continue;
    if (c.value === undefined || c.value === null || c.value === '') continue;
    const reps = c.repeat || 1;
    let sql = c.sql;
    for (let i = 0; i < reps; i++) {
      params.push(c.value);
      sql = sql.replace('?', `$${params.length}`);
    }
    clauses.push('(' + sql + ')');
  }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

export async function listData(db, { base, joins = '', alias = '', conditions, orderBy, query: q, select = '*' }) {
  const { page, limit, offset } = getPagination(q);
  const { where, params } = buildWhere(conditions);
  const countBase = alias ? `${alias} FROM ${base} ${joins}` : `* FROM ${base}`;
  const totalRow = await db.query(`SELECT COUNT(*) AS t FROM ${countBase} ${where}`, params);
  const total = totalRow.rows[0].t;
  const listParams = [...params, limit, offset];
  const rows = await db.query(
    `SELECT ${select} FROM ${base} ${joins} ${where} ORDER BY ${orderBy} LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { data: rows.rows, meta: paginationMeta(page, limit, total) };
}

export const positiveId = z.coerce.number().int().positive();

export function parseId(raw, label = 'ID') {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label} tidak valid`);
  return n;
}