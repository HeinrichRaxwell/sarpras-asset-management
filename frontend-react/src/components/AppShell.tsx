import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  LayoutDashboard, Package, Warehouse, Tags, MapPin, TrendingDown, Wallet,
  ArrowLeftRight, Repeat, Wrench, ShieldCheck, ClipboardCheck, History,
  Trash2, FileText, Users, Settings, LogOut, Moon, Sun, Menu, X,
  SlidersHorizontal, Bell, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getUser, clearAuth } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

interface NavItem { to: string; label: string; icon: React.ElementType; roles?: string[] }
interface NavGroup { label?: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Data Master',
    items: [
      { to: '/aset', label: 'Data Aset', icon: Package },
      { to: '/gudang', label: 'Gudang Transit (QC)', icon: Warehouse },
      { to: '/kategori', label: 'Kategori Aset', icon: Tags },
      { to: '/lokasi', label: 'Lokasi Aset', icon: MapPin },
    ],
  },
  {
    label: 'Keuangan Aset',
    items: [
      { to: '/penyusutan', label: 'Penyusutan Nilai', icon: TrendingDown },
      { to: '/sumber-dana', label: 'Sumber Dana', icon: Wallet },
    ],
  },
  {
    label: 'Operasional',
    items: [
      { to: '/peminjaman', label: 'Peminjaman Aset', icon: ArrowLeftRight },
      { to: '/mutasi', label: 'Mutasi Antar-Ruang', icon: Repeat },
      { to: '/servis-kuratif', label: 'Servis Kuratif', icon: Wrench },
      { to: '/servis-preventif', label: 'Servis Preventif', icon: ShieldCheck },
    ],
  },
  {
    label: 'Verifikasi & Audit',
    items: [
      { to: '/verifikasi', label: 'Inventarisasi Fisik', icon: ClipboardCheck },
      { to: '/audit', label: 'Audit Trail', icon: History, roles: ['admin'] },
    ],
  },
  {
    label: 'Hilir & Rekap',
    items: [
      { to: '/penghapusan', label: 'Penghapusan & Lelang', icon: Trash2 },
      { to: '/kir', label: 'Laporan Aset (KIR)', icon: FileText },
    ],
  },
  {
    label: 'Manajemen Sistem',
    items: [
      { to: '/pengguna', label: 'Pengguna & Peran', icon: Users, roles: ['admin'] },
      { to: '/pengaturan', label: 'Pengaturan', icon: Settings },
    ],
  },
];

/* ---------------- Glass workspace state ---------------- */
type GlassPreset = 'clear' | 'frosted' | 'solid';
interface GlassState {
  preset: GlassPreset;
  blur: number;       // px
  opacity: number;    // 0..1 (light-mode surface alpha)
  saturation: number; // 0..3
  edge: number;       // 0..1 inset highlight strength
  tint: string;       // "r g b"
}

const PRESETS: Record<GlassPreset, Omit<GlassState, 'preset' | 'tint'>> = {
  clear:   { blur: 8,  opacity: 0.30, saturation: 1.0, edge: 0.35 },
  frosted: { blur: 22, opacity: 0.62, saturation: 1.5, edge: 0.55 },
  solid:   { blur: 0,  opacity: 0.92, saturation: 1.0, edge: 0.15 },
};

const TINTS: { name: string; rgb: string }[] = [
  { name: 'Default', rgb: '255 255 255' },
  { name: 'Sky',     rgb: '224 238 255' },
  { name: 'Violet',  rgb: '238 232 255' },
  { name: 'Mint',    rgb: '226 250 242' },
  { name: 'Rose',    rgb: '255 232 240' },
];

const DARK_TINT = '15 23 42';
const STORAGE_KEY = 'sarpras_glass';

function loadGlass(): GlassState {
  const fallback: GlassState = { preset: 'frosted', ...PRESETS.frosted, tint: TINTS[0].rgb };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<GlassState>;
    return {
      preset: (p.preset && p.preset in PRESETS ? p.preset : 'frosted') as GlassPreset,
      blur: clamp(Number(p.blur ?? fallback.blur), 0, 40),
      opacity: clamp(Number(p.opacity ?? fallback.opacity), 0, 1),
      saturation: clamp(Number(p.saturation ?? fallback.saturation), 0, 3),
      edge: clamp(Number(p.edge ?? fallback.edge), 0, 1),
      tint: typeof p.tint === 'string' ? p.tint : fallback.tint,
    };
  } catch {
    return fallback;
  }
}
function clamp(v: number, lo: number, hi: number) {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}

/* ---------------- Small building blocks ---------------- */
function Popover({ open, onClose, children, labelledBy }: {
  open: boolean; onClose: () => void; children: ReactNode; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer so the toggle click that opened this doesn't immediately close it.
    const t = window.setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      window.clearTimeout(t);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={labelledBy}
      className="glass absolute right-0 top-[calc(100%+10px)] z-50 w-[300px] rounded-[22px] p-4"
    >
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[11.5px] font-semibold text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-ink/80">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-brand
                   [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:shadow-sm"
      />
    </label>
  );
}

/* ---------------- Main component ---------------- */
export function AppShell({ title }: { title: string }) {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const user = getUser();
  const [drawer, setDrawer] = useState(false);
  const [glassOpen, setGlassOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [glass, setGlass] = useState<GlassState>(loadGlass);
  const mainRef = useRef<HTMLDivElement>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(glass));
  }, [glass]);

  const applyPreset = (p: GlassPreset) => setGlass((g) => ({ ...g, preset: p, ...PRESETS[p] }));

  const visibleNav = NAV
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.roles || it.roles.includes(user?.role ?? '')) }))
    .filter((g) => g.items.length > 0);
  const flatNav = visibleNav.flatMap((g) => g.items);

  // Quick-nav dock: all visible nav items, horizontally scrollable.
  const dockItems = flatNav;

  /* GSAP reveal for panels entering the viewport */
  useGSAP(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = mainRef.current?.querySelectorAll('[data-gw-reveal]');
    if (!nodes || nodes.length === 0) return;
    if (reduce) {
      gsap.set(nodes, { opacity: 1, y: 0, filter: 'none' });
      return;
    }
    gsap.fromTo(
      nodes,
      { y: 12, opacity: 0.45, filter: 'blur(3px)' },
      {
        y: 0, opacity: 1, filter: 'blur(0px)',
        duration: 0.55, ease: 'power3.out', stagger: 0.045, overwrite: true,
      }
    );
  }, { scope: mainRef, dependencies: [title] });

  // Dark mode: cap surface alpha and force a dark tint so glass stays legible.
  const glassVars: CSSProperties = {
    '--gw-blur': `${glass.blur}px`,
    '--gw-opacity': isDark ? String(Math.min(glass.opacity, 0.18)) : String(glass.opacity),
    '--gw-saturation': String(glass.saturation),
    '--gw-tint': isDark ? DARK_TINT : glass.tint,
    '--gw-edge': String(isDark ? glass.edge * 0.25 : glass.edge),
  } as CSSProperties;

  const logout = () => {
    clearAuth();
    navigate('/login');
  };

  /* Full nav list — used in the mobile drawer */
  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      {visibleNav.map((group, gi) => (
        <div key={gi} className="mb-1">
          {group.label && (
            <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
              {group.label}
            </div>
          )}
          {group.items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-[13.5px] font-medium transition-colors',
                  isActive ? 'bg-brand text-white shadow-sm' : 'text-ink hover:bg-brand-soft'
                )
              }
            >
              <it.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="relative min-h-screen" style={glassVars}>
      {/* Decorative background photo/gradient behind the glass */}
      <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
        <img
          src="/glass-bg.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-brand/25 via-violet-500/15 to-transparent" />
        <div className="absolute inset-0 backdrop-blur-2xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/60 to-surface/30" />
      </div>

      {/* Floating topbar */}
      <header className="glass fixed inset-x-3 top-3 z-40 flex h-14 items-center gap-3 rounded-[22px] px-4 sm:inset-x-5 sm:top-4 sm:h-16 sm:px-5">
        <button
          className="icon-btn navbp:hidden"
          onClick={() => setDrawer(true)}
          aria-label="Buka menu"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br from-brand to-violet-500 text-[13px] font-extrabold text-white">
            SA
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-bold tracking-tight">SARPRAS AM</div>
            <div className="text-[10px] text-muted">Asset Management</div>
          </div>
        </div>
        <h1 className="ml-2 hidden truncate text-[15px] font-semibold text-muted lg:block">{title}</h1>

        <div className="ml-auto flex items-center gap-2">
          {/* Adjust glass */}
          <div className="relative">
            <button
              className={cn('icon-btn', glassOpen && 'bg-brand-soft')}
              onClick={() => { setGlassOpen((v) => !v); setBellOpen(false); }}
              aria-label="Adjust glass"
              aria-expanded={glassOpen}
              title="Adjust glass"
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
            <Popover open={glassOpen} onClose={() => setGlassOpen(false)} labelledBy="gw-title">
              <div id="gw-title" className="mb-3 flex items-center justify-between">
                <span className="text-[13px] font-bold">Adjust glass</span>
                <button className="icon-btn h-7 w-7" onClick={() => setGlassOpen(false)} aria-label="Tutup">
                  <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
              <div className="mb-3 flex gap-1.5">
                {(['clear', 'frosted', 'solid'] as GlassPreset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => applyPreset(p)}
                    className={cn(
                      'flex-1 rounded-[10px] border border-line px-2 py-1.5 text-[11.5px] font-semibold capitalize transition-colors',
                      glass.preset === p ? 'bg-brand text-white' : 'text-ink hover:bg-brand-soft'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2.5">
                <Slider label="Blur" value={glass.blur} min={0} max={40} step={1} onChange={(v) => setGlass((g) => ({ ...g, blur: v, preset: 'frosted' }))} format={(v) => `${v}px`} />
                <Slider label="Opacity" value={glass.opacity} min={0.05} max={1} step={0.01} onChange={(v) => setGlass((g) => ({ ...g, opacity: v }))} format={(v) => `${Math.round(v * 100)}%`} />
                <Slider label="Saturation" value={glass.saturation} min={0} max={3} step={0.05} onChange={(v) => setGlass((g) => ({ ...g, saturation: v }))} format={(v) => v.toFixed(2)} />
                <Slider label="Edge" value={glass.edge} min={0} max={1} step={0.01} onChange={(v) => setGlass((g) => ({ ...g, edge: v }))} format={(v) => `${Math.round(v * 100)}%`} />
              </div>
              <div className="mt-3">
                <div className="mb-1.5 text-[11.5px] font-semibold text-muted">Color tint</div>
                <div className="flex gap-2">
                  {TINTS.map((t) => (
                    <button
                      key={t.rgb}
                      title={t.name}
                      aria-label={`Tint ${t.name}`}
                      onClick={() => setGlass((g) => ({ ...g, tint: t.rgb }))}
                      style={{ background: `rgb(${t.rgb})` }}
                      className={cn(
                        'h-6 w-6 rounded-full border-2 transition-transform',
                        glass.tint === t.rgb ? 'scale-110 border-brand' : 'border-line'
                      )}
                    />
                  ))}
                </div>
              </div>
            </Popover>
          </div>

          {/* Theme toggle */}
          <button className="icon-btn" onClick={toggle} aria-label="Ganti tema">
            {isDark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              className={cn('icon-btn', bellOpen && 'bg-brand-soft')}
              onClick={() => { setBellOpen((v) => !v); setGlassOpen(false); }}
              aria-label="Notifikasi"
              aria-expanded={bellOpen}
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
            <Popover open={bellOpen} onClose={() => setBellOpen(false)} labelledBy="bell-title">
              <div id="bell-title" className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-bold">Notifikasi</span>
                <button className="icon-btn h-7 w-7" onClick={() => setBellOpen(false)} aria-label="Tutup">
                  <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
              <div className="flex flex-col items-center gap-1.5 py-6 text-center text-muted">
                <Bell className="h-7 w-7 opacity-40" strokeWidth={1.75} />
                <div className="text-[12.5px] font-semibold text-ink">Tidak ada notifikasi baru</div>
                <div className="text-[11.5px]">Semua pemberitahuan akan muncul di sini.</div>
              </div>
            </Popover>
          </div>

          {/* Avatar + logout */}
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-brand-soft"
            title={`Keluar (${user?.role ?? ''})`}
          >
            <div className="avatar">{(user?.nama || 'A').charAt(0).toUpperCase()}</div>
            <span className="hidden leading-tight sm:block">
              <span className="block text-[12.5px] font-semibold">{user?.nama}</span>
              <span className="block text-[10px] uppercase text-muted">{user?.role}</span>
            </span>
            <LogOut className="hidden h-4 w-4 text-danger sm:block" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Vertical icon rail (desktop >= 700px) */}
      <aside className="glass fixed left-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-[27px] px-1.5 py-3 navbp:flex">
        {flatNav.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            title={it.label}
            className={({ isActive }) =>
              cn(
                'group relative grid h-9 w-9 place-items-center rounded-[11px] transition-colors',
                isActive ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-brand-soft hover:text-ink'
              )
            }
          >
            <it.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            <span className="pointer-events-none absolute left-[calc(100%+8px)] whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-surface opacity-0 transition-opacity group-hover:opacity-100">
              {it.label}
            </span>
          </NavLink>
        ))}
      </aside>

      {/* Mobile drawer (<= 700px) */}
      {drawer && (
        <div className="fixed inset-0 z-50 navbp:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <aside className="glass absolute inset-y-0 left-0 flex w-[280px] flex-col rounded-r-[24px] p-3">
            <div className="mb-2 flex items-center gap-2.5 px-1 py-3">
              <div className="grid h-9 w-9 place-items-center rounded-[11px] bg-gradient-to-br from-brand to-violet-500 text-[13px] font-extrabold text-white">SA</div>
              <div className="leading-tight">
                <div className="text-[14px] font-bold tracking-tight">SARPRAS AM</div>
                <div className="text-[10px] text-muted">Asset Management</div>
              </div>
              <button className="icon-btn ml-auto" onClick={() => setDrawer(false)} aria-label="Tutup menu">
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <NavList onNavigate={() => setDrawer(false)} />
            <button
              onClick={logout}
              className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-[13.5px] font-medium text-danger transition-colors hover:bg-danger/10"
            >
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Keluar
            </button>
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex min-h-screen flex-col px-3 pb-28 pt-[88px] sm:px-5 navbp:pl-[88px]">
        <main ref={mainRef} className="flex-1">
          <Outlet />
        </main>
        <footer className="pt-6 pb-2 text-center text-[11.5px] text-muted">
          SARPRAS AM — Sistem Manajemen Sarana &amp; Prasarana &copy; {new Date().getFullYear()}
        </footer>
      </div>

      {/* Floating dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <nav
          aria-label="Quick navigation"
          className="glass pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto rounded-full p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {dockItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              title={it.label}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                  isActive ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-brand-soft hover:text-ink'
                )
              }
            >
              <it.icon className="h-4 w-4" strokeWidth={1.75} />
              <span className="hidden whitespace-nowrap lg:inline">{it.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

// Re-export ikon untuk halaman
export { Layers };
