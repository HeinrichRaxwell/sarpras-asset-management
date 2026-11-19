const { chromium } = require(process.env.PW_PATH);
const BASE = 'https://sarpras.heinrichraxwell.my.id';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/WINDOWS 11 PRO/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    locale: 'id-ID', extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' },
  });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4000);

  const hint = await page.evaluate(() => {
    const codes = [...document.querySelectorAll('code')].map(c => c.innerText.trim());
    const txt = document.body.innerText;
    // Ambil elemen terdalam yang memuat judul hint, bukan ancestor terluar.
    const boxes = [...document.querySelectorAll('div')].filter(d => d.innerText.includes('Akun pratinjau'));
    const box = boxes[boxes.length - 1];
    const form = document.querySelector('form');
    const fr = form?.getBoundingClientRect();
    const br = box?.getBoundingClientRect();
    return {
      codes,
      hasOld: /admin \/ admin123|petugas \/ petugas123|pimpinan \/ pimpinan123/.test(txt),
      heading: (txt.match(/Akun pratinjau[^\n]*/) || [''])[0],
      note: txt.includes('Aksi tambah, ubah, dan hapus dinonaktifkan'),
      formBottom: fr ? Math.round(fr.bottom) : null,
      hintTop: br ? Math.round(br.top) : null,
      belowForm: fr && br ? br.top >= fr.bottom - 2 : null,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      boxH: br ? Math.round(br.height) : null,
      clipped: box ? box.scrollWidth > box.clientWidth + 2 : null,
    };
  });
  console.log('HINT:', JSON.stringify(hint, null, 1));
  await page.screenshot({ path: 'C:/Users/WINDOWS 11 PRO/AppData/Local/Temp/login_hint.png' });

  // Klik kode kredensial lalu login betulan pakai password baru
  let fail = 0;
  for (const role of ['admin', 'petugas', 'pimpinan']) {
    // Context bersih tiap akun: localStorage akun sebelumnya bisa membuat
    // /login langsung redirect dan form tidak pernah muncul.
    const c2 = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      locale: 'id-ID', extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' },
    });
    await c2.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const p2 = await c2.newPage();
    await p2.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 90000 });
    await p2.waitForSelector('#username', { timeout: 30000 });
    await p2.fill('#username', `demo-${role}`);
    await p2.fill('#password', `demo-${role}123`);
    await p2.click('button[type="submit"]');
    await p2.waitForURL('**/dashboard', { timeout: 45000 }).catch(() => {});
    await p2.waitForTimeout(2500);
    const st = await p2.evaluate(() => ({
      path: location.pathname,
      user: JSON.parse(localStorage.getItem('sarpras_user') || 'null'),
      banner: document.body.innerText.includes('Mode Pratinjau'),
    }));
    const ok = st.path === '/dashboard' && st.user?.read_only === true && st.banner;
    if (!ok) fail++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} demo-${role} -> ${st.path} read_only=${st.user?.read_only} banner=${st.banner}`);
    await c2.close();
  }
  if (hint.hasOld || !hint.note || hint.belowForm === false || hint.codes.length < 3) fail++;
  console.log('pageerrors:', errs.slice(0, 3));
  await browser.close();
  console.log(fail === 0 ? '\nLOGIN HINT SEMUA PASS' : `\nGAGAL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });