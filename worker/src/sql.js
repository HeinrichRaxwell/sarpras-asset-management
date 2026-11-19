// Terjemahan konstruk PostgreSQL yang tidak ada di SQLite/D1.
// Dipanggil sekali per query di layer db, supaya 18 route tidak perlu diedit
// satu per satu untuk perbedaan dialek.

// COUNT(*) FILTER (WHERE cond) -> SUM(CASE WHEN cond THEN 1 ELSE 0 END)
// Parser kurung berimbang: kondisi boleh mengandung fungsi bersarang.
function rewriteFilter(text) {
  const re = /COUNT\s*\(\s*\*\s*\)\s*FILTER\s*\(\s*WHERE\s+/gi;
  let out = text;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue;
    const cond = text.slice(start, i);
    const replacement = `SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END)`;
    out = out.replace(text.slice(m.index, i + 1), replacement);
    re.lastIndex = 0;
    text = out;
  }
  return out;
}

export function translateSql(text) {
  let s = text;

  s = rewriteFilter(s);

  // cast ::type — SQLite menyimpan angka sebagai REAL/INTEGER dinamis
  s = s.replace(/::\s*(int|integer|bigint|numeric|decimal|real|double precision|float|text|varchar|boolean|date|timestamp)\b/gi, '');

  // ILIKE -> LIKE (SQLite LIKE sudah case-insensitive untuk ASCII)
  s = s.replace(/\bILIKE\b/gi, 'LIKE');

  // NOW() / CURRENT_TIMESTAMP tanpa kurung
  s = s.replace(/\bNOW\s*\(\s*\)/gi, "datetime('now')");

  // gen_random_uuid() tidak ada; qr_token diisi aplikasi sebelum INSERT
  s = s.replace(/\bgen_random_uuid\s*\(\s*\)/gi, "lower(hex(randomblob(16)))");

  // SUBSTRING(x FROM n) -> SUBSTR(x, n)
  s = s.replace(/SUBSTRING\s*\(\s*([^,()]+?)\s+FROM\s+(\d+)\s*\)/gi, 'SUBSTR($1, $2)');

  // to_char(date_trunc('month', col), 'YYYY-MM') -> strftime('%Y-%m', col)
  s = s.replace(
    /to_char\s*\(\s*date_trunc\s*\(\s*'month'\s*,\s*([^)]+?)\s*\)\s*,\s*'YYYY-MM'\s*\)/gi,
    "strftime('%Y-%m', $1)"
  );
  s = s.replace(
    /to_char\s*\(\s*date_trunc\s*\(\s*'year'\s*,\s*([^)]+?)\s*\)\s*,\s*'YYYY'\s*\)/gi,
    "strftime('%Y', $1)"
  );
  s = s.replace(/date_trunc\s*\(\s*'month'\s*,\s*([^)]+?)\s*\)/gi, "date($1, 'start of month')");
  s = s.replace(/date_trunc\s*\(\s*'year'\s*,\s*([^)]+?)\s*\)/gi, "date($1, 'start of year')");

  // EXTRACT(YEAR FROM col) -> CAST(strftime('%Y', col) AS INTEGER)
  s = s.replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+([^)]+?)\s*\)/gi, "CAST(strftime('%Y', $1) AS INTEGER)");
  s = s.replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+([^)]+?)\s*\)/gi, "CAST(strftime('%m', $1) AS INTEGER)");

  // CURRENT_DATE +/- INTERVAL 'n unit' -> date('now', '+n units')
  // Harus dibungkus date(), bukan ditempel sebagai argumen terpisah.
  s = s.replace(
    /\bCURRENT_DATE\s*([+-])\s*INTERVAL\s*'(\d+)\s*(day|days|month|months|year|years)'/gi,
    (_, sign, n, unit) => `date('now', '${sign}${n} ${unit.replace(/s$/, '')}')`
  );
  s = s.replace(/\bCURRENT_DATE\b/gi, "date('now')");

  // TRUE/FALSE literal -> 1/0, hanya di luar string literal
  s = replaceOutsideStrings(s, (chunk) =>
    chunk.replace(/\bTRUE\b/g, '1').replace(/\bFALSE\b/g, '0')
  );

  return s;
}

// Jangan mengubah isi string SQL ('...'), termasuk '' sebagai escape kutip.
function replaceOutsideStrings(text, fn) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === "'") {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "'") {
          if (text[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j++;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      let j = i;
      while (j < text.length && text[j] !== "'") j++;
      out += fn(text.slice(i, j));
      i = j;
    }
  }
  return out;
}