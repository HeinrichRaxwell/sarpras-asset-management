const { chromium } = require(process.env.PW_PATH);
const fs = require('fs');
const BASE = 'https://sarpras.heinrichraxwell.my.id';
const creds = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ownerPw = process.argv[3];

const ROUTES = ['/dashboard', '/aset', '/gudang', '/kategori', '/lokasi', '/penyusutan',
  '/sumber-dana', '/peminjaman', '/mutasi', '/servis-kuratif', '/servis-preventif',
  '/verifikasi', '/penghapusan', '/kir', '/audit', '/pengguna'];
const WRITE = ['Tambah', 'Simpan', 'Hapus', 'Edit', 'Setujui', 'Tolak', 'Hitung', 'Kembalikan',
  'Proses', 'Ajukan', 'Buat', 'Reset', 'Nonaktifkan', 'Aktifkan', 'Lolos', 'Tandai', 'Selesai', 'Mulai'];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/WINDOWS 11 PRO/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const accounts = [
    { username: 'Raxwell', password: ownerPw, ro: false },
    ...creds.demos.map(d => ({ username: d.username, password: d.password, ro: true })),
  ];
  let fail = 0, checks = 0;

  for (const acc of accounts) {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      locale: 'id-ID', extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' },
    });
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2600);
    await page.fill('#username', acc.username);
    await page.fill('#password', acc.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4500);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sarpras_user') || 'null'));
    checks++;
    const okRo = !!stored?.read_only === acc.ro;
    if (!okRo) fail++;
    console.log(`\n${acc.username} read_only=${stored?.read_only} ${okRo ? 'OK' : 'FAIL'}`);

    const bad = [];
    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1700);
      const res = await page.evaluate((labels) => {
        const btns = [...document.querySelectorAll('button')]
          .filter(b => !b.disabled && b.offsetParent !== null)
          .map(b => (b.innerText || b.getAttribute('aria-label') || b.title || '').trim())
          .filter(Boolean);
        return {
          banner: document.body.innerText.includes('Mode Pratinjau'),
          writes: btns.filter(t => labels.some(l => t.includes(l))),
          bodyLen: document.body.innerText.length,
        };
      }, WRITE);
      checks++;
      const okBanner = res.banner === acc.ro;
      const okWrites = acc.ro ? res.writes.length === 0 : true;
      const okRender = res.bodyLen > 400;
      if (!okBanner || !okWrites || !okRender) { fail++; bad.push({ r, ...res, okBanner, okWrites, okRender }); }
      const mark = (okBanner && okWrites && okRender) ? 'OK  ' : 'FAIL';
      console.log(`  ${mark} ${r.padEnd(19)} banner=${res.banner ? 'Y' : 'n'} tulis=${res.writes.length}${res.writes.length ? ' ' + JSON.stringify(res.writes.slice(0, 4)) : ''}`);
    }
    if (errs.length) console.log('  pageerrors:', errs.slice(0, 3));
    await ctx.close();
  }
  await browser.close();
  console.log(`\nchecks=${checks} gagal=${fail}`);
  console.log(fail === 0 ? 'UI SEMUA PASS' : 'UI GAGAL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });