// Audit routes — immutable change log (admin only)
const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { getPagination, paginationMeta, wrap, HttpError } = require('./_helpers');

const router = express.Router();
router.use(authenticate, authorize('admin'));

// GET /api/audit — list with filters
router.get('/', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query, 50);
  const conditions = [];
  if (req.query.entitas) conditions.push({ sql: 'a.entitas = ?', value: String(req.query.entitas) });
  if (req.query.aksi) conditions.push({ sql: 'a.aksi = ?', value: String(req.query.aksi) });
  if (req.query.user_id) conditions.push({ sql: 'a.user_id = ?', value: Number(req.query.user_id) });
  if (req.query.username) conditions.push({ sql: 'u.username = ?', value: String(req.query.username) });
  if (req.query.dari) conditions.push({ sql: 'a.waktu >= ?', value: String(req.query.dari) });
  if (req.query.sampai) conditions.push({ sql: 'a.waktu <= ?', value: String(req.query.sampai) + ' 23:59:59' });

  const clauses = [];
  const params = [];
  for (const c of conditions) {
    params.push(c.value);
    clauses.push('(' + c.sql.replace('?', `$${params.length}`) + ')');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS t FROM audit_trail a LEFT JOIN users u ON u.id = a.user_id ${where}`, params)).rows[0].t;
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT a.*, u.username, u.nama AS user_nama FROM audit_trail a
     LEFT JOIN users u ON u.id = a.user_id
     ${where} ORDER BY a.waktu DESC, a.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

// GET /api/audit/entity/:entitas/:id — audit trail scoped to a single entity instance
router.get('/entity/:entitas/:id', wrap(async (req, res) => {
  const { limit, offset, page } = getPagination(req.query, 50);
  const total = (await query(
    'SELECT COUNT(*)::int AS t FROM audit_trail WHERE entitas = $1 AND entitas_id = $2',
    [req.params.entitas, req.params.id]
  )).rows[0].t;
  const { rows } = await query(
    `SELECT a.*, u.username, u.nama AS user_nama FROM audit_trail a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.entitas = $1 AND a.entitas_id = $2
     ORDER BY a.waktu DESC, a.id DESC LIMIT $3 OFFSET $4`,
    [req.params.entitas, req.params.id, limit, offset]
  );
  res.json({ ok: true, data: rows, meta: paginationMeta(page, limit, total) });
}));

module.exports = router;
