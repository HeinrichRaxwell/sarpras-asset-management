import assert from 'node:assert/strict';
import { toSqlite, toParams, makeDb } from '../src/db.js';

assert.equal(toSqlite('SELECT * FROM t WHERE a = $1 AND b = $2'), 'SELECT * FROM t WHERE a = ? AND b = ?');
assert.deepEqual(toParams('WHERE a = $1 AND b = $2', ['x', 'y']), ['x', 'y']);

// buildWhere dapat mengulang nilai yang sama; urutan harus mengikuti kemunculan
const repeated = '(a LIKE $1 OR b LIKE $1 OR c LIKE $1) AND d = $2';
assert.deepEqual(toParams(repeated, ['%q%', 7]), ['%q%', '%q%', '%q%', 7]);

// urutan tidak berurutan sama sekali
assert.deepEqual(toParams('a = $2 AND b = $1', ['first', 'second']), ['second', 'first']);
assert.deepEqual(toParams('SELECT 1', []), []);

// D1 palsu: merekam SQL + bind, mengembalikan hasil tetap
function fakeD1() {
  const calls = [];
  const batches = [];
  const mk = (sql, binds) => ({
    async all() { calls.push({ sql, binds }); return { results: [{ id: 1 }], meta: { changes: 1 } }; },
  });
  return {
    calls, batches,
    prepare(sql) { return { bind: (...b) => mk(sql, b), all: async () => mk(sql, []).all() }; },
    async batch(stmts) { batches.push(stmts.length); for (const s of stmts) await s.all(); },
  };
}

const d1 = fakeD1();
const db = makeDb(d1);

const r = await db.query('SELECT id FROM users WHERE username = $1', ['admin']);
assert.deepEqual(r.rows, [{ id: 1 }]);
assert.equal(d1.calls[0].sql, 'SELECT id FROM users WHERE username = ?');
assert.deepEqual(d1.calls[0].binds, ['admin']);

// normalisasi boolean/objek/undefined
await db.query('INSERT INTO t (a,b,c) VALUES ($1,$2,$3)', [true, { x: 1 }, undefined]);
assert.deepEqual(d1.calls.at(-1).binds, [1, '{"x":1}', null]);

// transaksi: SELECT dieksekusi langsung, write ditunda ke satu batch
const before = d1.batches.length;
const out = await db.withTransaction(async (c) => {
  const ref = await c.query('SELECT id FROM kategori WHERE id = $1', [3]);
  assert.deepEqual(ref.rows, [{ id: 1 }], 'SELECT dalam transaksi harus bisa dibaca');
  await c.query('DELETE FROM servis WHERE aset_kode = $1', ['AM-1']);
  await c.query('DELETE FROM aset WHERE kode = $1', ['AM-1']);
  return 'done';
});
assert.equal(out, 'done');
assert.equal(d1.batches.length, before + 1);
assert.equal(d1.batches.at(-1), 2, 'dua write harus jadi satu batch berisi 2 statement');

console.log('db adapter: semua assert lolos');