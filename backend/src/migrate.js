// Migration runner: applies schema.sql then seed.sql to DATABASE_URL
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[migrate] DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  // Split SQL file into statements. Respects $$ ... $$ blocks (functions/triggers)
  // and ignores standalone comments / blank segments.
  function splitStatements(sql) {
    const out = [];
    let buf = '';
    let inDollar = false;
    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      if (!inDollar && ch === '$' && sql[i + 1] === '$') {
        inDollar = true;
        buf += '$$';
        i++;
        continue;
      }
      if (inDollar && ch === '$' && sql[i + 1] === '$') {
        inDollar = false;
        buf += '$$';
        i++;
        continue;
      }
      if (!inDollar && ch === ';') {
        const stmt = buf.trim();
        if (stmt && !stmt.startsWith('--')) out.push(stmt);
        buf = '';
        continue;
      }
      buf += ch;
    }
    const tail = buf.trim();
    if (tail && !tail.startsWith('--')) out.push(tail);
    return out;
  }

  const files = [
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, 'seed.sql'),
  ];

  for (const file of files) {
    const label = path.basename(file);
    if (!fs.existsSync(file)) {
      console.warn(`[migrate] skip ${label} (not found)`);
      continue;
    }
    const sql = fs.readFileSync(file, 'utf8');
    const statements = splitStatements(sql);
    console.log(`[migrate] ${label}: ${statements.length} statements`);
    for (let i = 0; i < statements.length; i++) {
      try {
        await client.query(statements[i]);
      } catch (err) {
        console.error(`[migrate] gagal pada ${label} stmt #${i + 1}: ${err.message}`);
        console.error('Statement:', statements[i].slice(0, 160));
        await client.end();
        process.exit(1);
      }
    }
    console.log(`[migrate] ${label} selesai`);
  }

  await client.end();
  console.log('[migrate] Semua migrasi berhasil dijalankan.');
}

main().catch((err) => {
  console.error('[migrate] fatal:', err.message);
  process.exit(1);
});
