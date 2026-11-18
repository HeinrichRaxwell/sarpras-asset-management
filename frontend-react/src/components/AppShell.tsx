import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, Package, Warehouse, Tags, MapPin, TrendingDown, Wallet,
  ArrowLeftRight, Repeat, Wrench, ShieldCheck, ClipboardCheck, History,
  Trash2, FileText, Users, Settings, LogOut, Moon, Sun, Menu, X,
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
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const user = getUser();

  const logout = async () => {
    clearAuth();
    navigate('/login');
  };

  const Nav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      {NAV.map((group, gi) => (
        <div key={gi} className="mb-1">
          {group.label && (
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
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition-colors',
                    isActive
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-ink hover:bg-brand-soft'
                  )
                }
              >
                <it.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                <span>{it.label}</span>
              </NavLink>
            ))}
        </div>
      ))}
    </nav>
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
          'glass fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col rounded-r-[1.25rem] transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-2.5 px-3 py-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-brand to-violet-500 text-[13px] font-extrabold text-white">
            SA
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-bold tracking-tight">SARPRAS AM</div>
            <div className="text-[10px] text-muted">Asset Management</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <Nav onNavigate={() => setOpen(false)} />
        <div className="px-2 pb-4">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:ml-[264px]">
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 rounded-none border-x-0 border-t-0 px-5">
          <button className="icon-btn lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={toggle} className="icon-btn" aria-label="Ganti tema">
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <div className="avatar">{(user?.nama || 'A').charAt(0).toUpperCase()}</div>
            <div className="hidden sm:block leading-tight">
              <div className="text-[13px] font-semibold">{user?.nama}</div>
              <div className="text-[10.5px] text-muted uppercase">{user?.role}</div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>

        <footer className="px-6 pb-5 text-center text-[11.5px] text-muted">
          SARPRAS AM — Sistem Manajemen Sarana &amp; Prasarana &copy; {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

// Re-export ikon untuk halaman
export { Layers } from 'lucide-react';