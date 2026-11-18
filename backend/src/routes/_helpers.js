// Shared helpers for route modules
const { ZodError } = require('zod');
const { query } = require('../db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wrap async handlers so rejections reach the central error handler
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Parse body with a zod schema; on failure respond 400 and return {ok:false}
function validate(schema, data, res) {
  try {
    return { ok: true, value: schema.parse(data) };
  } catch (err) {
    if (err instanceof ZodError) {
      const detail = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({ ok: false, error: `Validasi gagal: ${detail}` });
      return { ok: false };
    }
    throw err;
  }
}

// Resolve ?page&limit from query, with sane bounds
function getPagination(q, defLimit = 20, maxLimit = 500) {
  const page = Math.max(1, parseInt(q?.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(q?.limit, 10) || defLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// Generate a unique asset code AM-YYYY-NNNN using the current max sequence for the year
async function generateAsetKode(client, year) {
  const y = year || new Date().getFullYear();
  const prefix = `AM-${y}-`;
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(kode FROM ${prefix.length + 1}) AS INT)), 0) AS mx
     FROM aset WHERE kode LIKE $1`,
    [prefix + '%']
  );
  const next = (rows[0]?.mx || 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// Build a parameterized WHERE clause from a list of {sql, value, repeat?}
function buildWhere(conditions) {
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

// Standard paginated list response: {ok, data, meta}
async function listResponse(res, { base, joins = '', alias = '', conditions, orderBy, req, select = '*' }) {
  const { page, limit, offset } = getPagination(req.query);
  const { where, params } = buildWhere(conditions);
  const countBase = alias ? `${alias} FROM ${base} ${joins}` : `* FROM ${base}`;
  const totalRow = await query(`SELECT COUNT(*)::int AS t FROM ${countBase} ${where}`, params);
  const total = totalRow.rows[0].t;
  const listParams = [...params, limit, offset];
  const rows = await query(
    `SELECT ${select} FROM ${base} ${joins} ${where} ORDER BY ${orderBy} LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows.rows, meta: paginationMeta(page, limit, total) });
}

module.exports = { HttpError, wrap, validate, getPagination, paginationMeta, generateAsetKode, buildWhere, listResponse };
