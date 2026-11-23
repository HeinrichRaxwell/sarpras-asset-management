import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, Package, Warehouse, Tags, MapPin, TrendingDown, Wallet,
  ArrowLeftRight, Repeat, Wrench, ShieldCheck, ClipboardCheck, History,
  Trash2, FileText, Users, Settings, LogOut, Moon, Sun, X, PanelLeft, Eye,
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

export function AppShell({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const user = getUser();
  const navScrollRef = useRef<HTMLDivElement>(null);

  const logout = async () => {
    clearAuth();
    navigate('/login');
  };

  // Anti scroll-jump: posisi scroll nav disimpan & dipulihkan tiap route berubah
  useEffect(() => {
    const el = navScrollRef.current;
    if (el) el.scrollTop = Number(sessionStorage.getItem('sarpras_nav_scroll') ?? '0');
  });

  const handleNavScroll = () => {
    if (navScrollRef.current) {
      sessionStorage.setItem('sarpras_nav_scroll', String(navScrollRef.current.scrollTop));
    }
  };

  const nav = (
    <div ref={navScrollRef} onScroll={handleNavScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
      {NAV.map((group, gi) => (
        <div key={gi} className="mb-1">
          {group.label && !collapsed && (
            <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
              {group.label}
            </div>
          )}
          {group.items
            .filter((it) => !it.roles || it.roles.includes(user?.role ?? ''))
            .map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                onClick={() => setOpen(false)}
                title={collapsed ? it.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-2.5 rounded-[10px] font-medium transition-colors',
                    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2 text-[13.5px]',
                    isActive
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-ink hover:bg-brand-soft'
                  )
                }
              >
                <it.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                {!collapsed && <span className="truncate">{it.label}</span>}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11.5px] font-medium text-white shadow-lg group-hover:block">
                    {it.label}
                  </span>
                )}
              </NavLink>
            ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'glass fixed inset-y-0 left-0 z-50 flex flex-col rounded-r-[1.25rem] transition-[transform,width] duration-300 lg:translate-x-0',
          collapsed ? 'w-[76px]' : 'w-[264px]',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className={cn('relative flex items-center gap-2.5 px-3 py-5', collapsed && 'justify-center px-2')}>
          {!collapsed && (
            <>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#0A1B2E] to-[#F5B301] text-[13px] font-extrabold text-white">
                RP
              </div>
              <div className="leading-tight">
                <div className="text-[14px] font-bold tracking-tight">RAILPRAS</div>
                <div className="text-[10px] text-muted">Asset Management</div>
              </div>
            </>
          )}
          {/* Tombol minimize — di dalam sidebar; saat collapse jadi satu-satunya di area logo */}
          <button
            onClick={() => setCollapsed((s) => !s)}
            title={collapsed ? 'Perluas sidebar' : 'Perkecil sidebar'}
            aria-label={collapsed ? 'Perluas sidebar' : 'Perkecil sidebar'}
            className={cn(
              'icon-btn shrink-0',
              collapsed ? 'lg:grid' : 'ml-auto hidden lg:grid'
            )}
          >
            <PanelLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        {nav}
        <div className="px-2 pb-4">
          <button
            onClick={logout}
            title={collapsed ? 'Keluar' : undefined}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-[10px] py-2 text-[13.5px] font-medium text-danger transition-colors hover:bg-danger/10',
              collapsed ? 'justify-center px-0' : 'px-3'
            )}
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {!collapsed && 'Keluar'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={cn('flex min-w-0 flex-1 flex-col transition-[margin] duration-300', collapsed ? 'lg:ml-[76px]' : 'lg:ml-[264px]')}>
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 rounded-none border-x-0 border-t-0 px-5">
          <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={toggle} className="icon-btn" aria-label="Ganti tema">
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <div className="avatar">{(user?.nama || 'A').charAt(0).toUpperCase()}</div>
            <div className="hidden sm:block leading-tight">
              <div className="text-[13px] font-semibold">{user?.nama}</div>
              <div className="text-[10.5px] text-muted uppercase">{user?.role}{user?.read_only ? ' · pratinjau' : ''}</div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">
          {user?.read_only && (
            <div className="mb-5 flex items-start gap-3 rounded-[12px] border border-amber-400/40 bg-amber-400/10 px-4 py-3">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="text-[12.5px] leading-relaxed">
                <span className="font-semibold">Mode Pratinjau</span> — akun ini hanya dapat melihat data.
                Semua aksi tambah, ubah, dan hapus dinonaktifkan agar data tetap utuh.
              </div>
            </div>
          )}
          <Outlet />
        </main>

        <footer className="px-6 pb-5 text-center text-[11.5px] text-muted">
          RAILPRAS — Sistem Manajemen Sarana &amp; Prasarana &copy; {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

// Re-export ikon untuk halaman
export { Layers } from 'lucide-react';