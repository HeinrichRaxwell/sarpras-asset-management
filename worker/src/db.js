// Adapter D1 yang mempertahankan bentuk API pg: query(text, params) -> { rows }
// dan withTransaction(fn). Placeholder $n diterjemahkan ke ? berurutan.
//
// ponytail: D1 tidak punya BEGIN interaktif. withTransaction mengeksekusi SELECT
// langsung (read-your-writes tidak dijamin) dan menunda semua write ke satu
// batch() atomik di akhir. Cukup untuk pola validasi-baca lalu tulis yang dipakai
// repo ini; kalau nanti butuh read-after-write dalam transaksi, pindah ke
// Durable Object SQLite atau sesi D1 interaktif.

import { translateSql } from './sql.js';

const NAMED = /\$(\d+)/g;
const READ_ONLY = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i;

export function toSqlite(text) {
  return text.replace(NAMED, '?');
}

// pg mengikat parameter sesuai urutan $1..$n; SQLite butuh urutan kemunculan.
// Query yang mengulang $1 beberapa kali harus direkonstruksi urutannya.
export function toParams(text, params = []) {
  const order = [];
  for (const m of text.matchAll(NAMED)) order.push(Number(m[1]) - 1);
  if (order.length === 0) return [];
  const sequential = order.every((v, i) => v === i);
  return sequential ? params.slice(0, order.length) : order.map((i) => params[i]);
}

function normalize(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

function prepare(d1, text, params) {
  const sql = toSqlite(translateSql(text));
  const binds = toParams(text, params).map(normalize);
  return binds.length ? d1.prepare(sql).bind(...binds) : d1.prepare(sql);
}

async function run(d1, text, params) {
  const res = await prepare(d1, text, params).all();
  return {
    rows: res.results ?? [],
    rowCount: res.meta?.changes ?? (res.results?.length ?? 0),
    meta: res.meta,
  };
}

export function makeDb(d1) {
  const query = (text, params = []) => run(d1, text, params);

  async function withTransaction(fn) {
    const writes = [];
    const client = {
      async query(text, params = []) {
        if (READ_ONLY.test(text)) return run(d1, text, params);
        writes.push(prepare(d1, text, params));
        return { rows: [], rowCount: 0 };
      },
    };
    const result = await fn(client);
    if (writes.length) await d1.batch(writes);
    return result;
  }

  return { query, withTransaction, raw: d1 };
}