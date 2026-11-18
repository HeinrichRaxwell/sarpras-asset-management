/* =========================================================================
   SARPRAS AM — Core app.js
   API client, auth guard, sidebar, toast, modal, format, chart helpers.
   ========================================================================= */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG;
  const TOKEN_KEY = 'sarpras_token';
  const USER_KEY = 'sarpras_user';

  // ============================ API CLIENT ============================
  async function api(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(CFG.API_BASE + path, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (res.status === 401) {
      clearAuth();
      window.location.href = '/index.html';
      throw new Error('Sesi berakhir, silakan login kembali');
    }
    if (!res.ok || (data && data.ok === false)) {
      throw new Error((data && data.error) || 'Terjadi kesalahan pada server');
    }
    return data;
  }

  const Api = {
    get: (p) => api(p),
    post: (p, body) => api(p, { method: 'POST', body }),
    put: (p, body) => api(p, { method: 'PUT', body }),
    patch: (p, body) => api(p, { method: 'PATCH', body }),
    delete: (p) => api(p, { method: 'DELETE' }),
  };

  // ============================ AUTH ============================
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (_) { return null; }
  }
  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // Guard: redirect ke login jika belum auth
  function requireAuth() {
    if (!getToken() || !getUser()) {
      window.location.href = '/index.html';
      return false;
    }
    return true;
  }

  function can(action) {
    const role = getUser()?.role;
    if (role === 'admin') return true;
    if (role === 'petugas') return !['delete_master', 'approve'].includes(action);
    if (role === 'pimpinan') return ['read', 'approve'].includes(action);
    return false;
  }

  // ============================ FORMAT ============================
  function formatCurrency(v) {
    const n = Number(v) || 0;
    return new Intl.NumberFormat(CFG.LOCALE, {
      style: 'currency', currency: CFG.CURRENCY, minimumFractionDigits: 0,
    }).format(n);
  }
  function formatNumber(v) {
    return new Intl.NumberFormat(CFG.LOCALE).format(Number(v) || 0);
  }
  function formatDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d)) return '-';
    return d.toLocaleDateString(CFG.LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function formatDateTime(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d)) return '-';
    return d.toLocaleString(CFG.LOCALE, {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
  function daysBetween(a, b) {
    return Math.ceil((new Date(b) - new Date(a)) / 86400000);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  // Debounce untuk search input
  function debounce(fn, ms = 300) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  // ============================ TOAST ============================
  function ensureToastContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }
  function toast(msg, type = 'info') {
    const c = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'ok' || type === 'err' ? type : '');
    el.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      (type === 'ok' ? '<polyline points="20 6 9 17 4 12"></polyline>' :
       type === 'err' ? '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>' :
       '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>') +
      '</svg><span>' + escapeHtml(msg) + '</span>';
    c.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; el.style.transition = '.25s'; }, 2800);
    setTimeout(() => el.remove(), 3100);
  }

  // ============================ MODAL ============================
  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('show');
    document.body.style.overflow = '';
    // reset form di dalam modal
    const form = m.querySelector('form');
    if (form) { form.reset(); clearErrors(form); }
  }
  // Tutup modal saat klik backdrop
  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('show');
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.show').forEach((m) => {
        m.classList.remove('show'); document.body.style.overflow = '';
      });
    }
  });

  // ============================ FORM VALIDATION ============================
  function clearErrors(form) {
    form.querySelectorAll('.error-text').forEach((e) => e.classList.remove('show'));
    form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
  }
  function showFieldError(form, name, msg) {
    const input = form.querySelector(`[name="${name}"]`);
    const err = form.querySelector(`[data-error="${name}"]`);
    if (input) input.classList.add('invalid');
    if (err) { err.textContent = msg; err.classList.add('show'); }
  }
  // Validasi form: cek required fields. return true jika valid.
  function validateForm(form) {
    clearErrors(form);
    let valid = true;
    form.querySelectorAll('[required]').forEach((input) => {
      const name = input.name;
      const val = (input.value || '').trim();
      if (!val) {
        showFieldError(form, name, 'Kolom ini wajib diisi');
        valid = false;
      }
    });
    return valid;
  }
  // Kumpulkan data form jadi object
  function formData(form) {
    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) {
      // numeric fields
      if (/^(nilai|biaya|denda|jumlah|qty|stok|umur|persen|tahun|kategori_id|lokasi_id|sumber_dana_id|lokasi_asal_id|lokasi_tujuan_id|disetujui_oleh|verifikasi_id|parent_id|role)/.test(k)) {
        obj[k] = v === '' ? null : Number(v);
      } else {
        obj[k] = v === '' ? null : v;
      }
    }
    return obj;
  }
  function fillForm(form, data) {
    clearErrors(form);
    Object.entries(data || {}).forEach(([k, v]) => {
      const el = form.querySelector(`[name="${k}"]`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : v;
    });
  }

  // ============================ BADGES ============================
  function badge(text, type) {
    const cls = { ok: 'badge-ok', warn: 'badge-warn', bad: 'badge-bad', info: 'badge-info', muted: 'badge-muted' }[type || 'muted'];
    return '<span class="badge ' + cls + '">' + escapeHtml(text) + '</span>';
  }
  function statusBadge(status) {
    const map = {
      'Aktif': 'ok', 'Baik': 'ok', 'Dikembalikan': 'ok', 'Selesai': 'ok', 'Lolos': 'ok',
      'Dipinjam': 'info', 'Diproses': 'info', 'Proses': 'info', 'Menunggu': 'warn',
      'Antri': 'warn', 'Diperbaiki': 'warn', 'Rusak Ringan': 'warn', 'Terlambat': 'bad',
      'Rusak Berat': 'bad', 'Dihapus': 'bad', 'Ditolak': 'bad',
      'Servis': 'warn', 'Mutasi': 'info',
    };
    return badge(status, map[status] || 'muted');
  }

  // ============================ SIDEBAR / LAYOUT ============================
  function renderShell(activePage) {
    const user = getUser();
    if (!user) return;
    // Set avatar + nama di topbar
    const avatarEl = document.querySelector('.topbar .avatar');
    const nameEl = document.querySelector('.topbar .user-name');
    const roleEl = document.querySelector('.topbar .user-role');
    if (avatarEl) avatarEl.textContent = (user.nama || user.username || 'A').charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = user.nama || user.username;
    if (roleEl) roleEl.textContent = (user.role || '').toUpperCase();
    // tandai nav aktif
    document.querySelectorAll('.nav-link').forEach((a) => {
      if (a.dataset.page === activePage) a.classList.add('active');
    });
    // sembunyikan menu yang tidak boleh diakses role
    document.querySelectorAll('[data-roles]').forEach((el) => {
      const roles = el.dataset.roles.split(',');
      if (!roles.includes(user.role)) el.style.display = 'none';
    });
    // toggle sidebar mobile
    const toggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.overlay');
    if (toggle && sidebar) {
      toggle.addEventListener('click', () => {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('show');
      });
    }
    if (overlay && sidebar) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      });
    }
    // logout
    document.querySelectorAll('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await Api.post('/auth/logout'); } catch (_) {}
        clearAuth();
        window.location.href = '/index.html';
      });
    });
  }

  // ============================ THEME ============================
  function initTheme() {
    const saved = localStorage.getItem('sarpras_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sarpras_theme', next);
    updateThemeIcon(next);
    // re-render chart colors if ada
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  }
  function updateThemeIcon(theme) {
    document.querySelectorAll('[data-theme-icon]').forEach((el) => {
      el.style.display = (theme === 'dark') ? 'none' : 'block';
    });
    document.querySelectorAll('[data-theme-icon-dark]').forEach((el) => {
      el.style.display = (theme === 'dark') ? 'block' : 'none';
    });
  }

  // ============================ CHART HELPERS ============================
  function chartColors() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      ink: dark ? '#e2e8f0' : '#0f172a',
      muted: dark ? '#94a3b8' : '#64748b',
      grid: dark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)',
      palette: ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#db2777', '#65a30d'],
    };
  }
  function baseChartOptions() {
    const c = chartColors();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: c.ink, font: { size: 12 } } },
        tooltip: { bodyFont: { size: 12 }, titleFont: { size: 12 } },
      },
      scales: {
        x: { ticks: { color: c.muted, font: { size: 11 } }, grid: { color: c.grid } },
        y: { ticks: { color: c.muted, font: { size: 11 } }, grid: { color: c.grid } },
      },
    };
  }
  function makeChart(canvasId, type, data, options) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    if (el._chart) el._chart.destroy();
    const merged = Object.assign(baseChartOptions(), options || {});
    el._chart = new Chart(el.getContext('2d'), { type, data, options: merged });
    return el._chart;
  }

  // ============================ INIT ============================
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
      btn.addEventListener('click', toggleTheme);
    });
  });

  // Expose global
  window.App = {
    Api, api, getToken, getUser, setAuth, clearAuth, requireAuth, can,
    formatCurrency, formatNumber, formatDate, formatDateTime, daysBetween,
    escapeHtml, debounce, toast, openModal, closeModal,
    validateForm, formData, fillForm, clearErrors, showFieldError,
    badge, statusBadge, renderShell, initTheme, toggleTheme,
    chartColors, baseChartOptions, makeChart,
  };
})();