import { useCallback, useEffect, useState } from 'react';
import {
  History, RefreshCw, ChevronLeft, ChevronRight, Search, ShieldAlert,
  Filter, X, Eye, User as UserIcon, Database, Globe,
} from 'lucide-react';
import { api, can, getUser } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import {
  Button, Field, Input, Select, Modal, Badge, PageHeader, EmptyState, Skeleton,
} from '@/components/ui';
import { useToast } from '@/context/ToastContext';

type Aksi = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';

interface AuditRow {
  id: number;
  user_id: number | null;
  username: string | null;
  user_nama: string | null;
  entitas: string;
  entitas_id: string | null;
  aksi: Aksi;
  sebelum: unknown;
  sesudah: unknown;
  ip: string | null;
  user_agent: string | null;
  waktu: string;
}

const PAGE_SIZE = 15;

const aksiType = (a: Aksi) => {
  switch (a) {
    case 'CREATE': return 'ok' as const;
    case 'UPDATE': return 'info' as const;
    case 'DELETE': return 'bad' as const;
    case 'LOGIN': return 'ok' as const;
    case 'LOGOUT': return 'muted' as const;
    default: return 'muted' as const;
  }
};

export default function AuditTrail() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ entitas: '', aksi: '', username: '', dari: '', sampai: '' });
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const isAdmin = getUser()?.role === 'admin';

  const fetchList = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filters.entitas) qs.set('entitas', filters.entitas);
      if (filters.aksi) qs.set('aksi', filters.aksi);
      if (filters.username) qs.set('username', filters.username);
      if (filters.dari) qs.set('dari', filters.dari);
      if (filters.sampai) qs.set('sampai', filters.sampai);
      const res = await api.get<AuditRow[]>(`/audit?${qs.toString()}`);
      setRows(res.data ?? []);
      setTotalPages(res.meta?.totalPages ?? 1);
      setTotal(res.meta?.total ?? 0);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, filters, isAdmin, toast]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const hasFilter = Object.values(filters).some(Boolean);
  const resetFilters = () => {
    setFilters({ entitas: '', aksi: '', username: '', dari: '', sampai: '' });
    setPage(1);
  };

  const openDetail = (row: AuditRow) => setDetail(row);

  if (!can('read') || !isAdmin) {
    return (
      <div className="space-y-5">
        <PageHeader title="Audit Trail" subtitle="Jejak perubahan data (khusus admin)" />
        <div className="glass rounded-2xl p-5">
          <EmptyState
            icon={<ShieldAlert className="h-8 w-8 text-danger" />}
            title="Akses ditolak"
            hint="Hanya administrator yang dapat melihat log audit."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Trail"
        subtitle="Jejak immutable seluruh perubahan data sistem"
        action={
          <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={fetchList} aria-label="Muat ulang">
            Muat ulang
          </Button>
        }
      />

      {/* Filter panel */}
      <div className="glass rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-bold">
          <Filter className="h-4 w-4 text-brand" /> Filter
          {hasFilter && (
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={resetFilters} className="ml-auto">
              Reset
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Entitas">
            <Input
              placeholder="aset, servis, …"
              value={filters.entitas}
              onChange={(e) => { setFilters({ ...filters, entitas: e.target.value }); setPage(1); }}
            />
          </Field>
          <Field label="Aksi">
            <Select
              value={filters.aksi}
              onChange={(e) => { setFilters({ ...filters, aksi: e.target.value }); setPage(1); }}
            >
              <option value="">Semua</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="LOGIN">LOGIN</option>
              <option value="LOGOUT">LOGOUT</option>
            </Select>
          </Field>
          <Field label="Username">
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={filters.username}
                onChange={(e) => { setFilters({ ...filters, username: e.target.value }); setPage(1); }}
                className="pl-9"
                placeholder="admin"
              />
            </div>
          </Field>
          <Field label="Dari">
            <Input
              type="date"
              value={filters.dari}
              onChange={(e) => { setFilters({ ...filters, dari: e.target.value }); setPage(1); }}
            />
          </Field>
          <Field label="Sampai">
            <Input
              type="date"
              value={filters.sampai}
              onChange={(e) => { setFilters({ ...filters, sampai: e.target.value }); setPage(1); }}
            />
          </Field>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              placeholder="Cari entitas / IP…"
              className="pl-9"
              onChange={(e) => {
                const q = e.target.value.toLowerCase();
                setRows((prev) => prev.filter((r) =>
                  !q || r.entitas.toLowerCase().includes(q) || (r.ip ?? '').toLowerCase().includes(q)
                ));
              }}
              aria-label="Filter cepat pada hasil"
            />
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <span>Halaman {page} / {totalPages} · {total} log</span>
            <button className="icon-btn" aria-label="Sebelumnya" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="icon-btn" aria-label="Berikutnya" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <Skeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<History className="h-8 w-8" />}
            title="Tidak ada log audit"
            hint="Coba ubah filter atau muat ulang halaman."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-2.5 pr-3 font-bold">Waktu</th>
                  <th className="py-2.5 pr-3 font-bold">Pengguna</th>
                  <th className="py-2.5 pr-3 font-bold">Entitas</th>
                  <th className="py-2.5 pr-3 font-bold">Aksi</th>
                  <th className="py-2.5 pr-3 font-bold">IP</th>
                  <th className="py-2.5 font-bold text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0 transition-colors hover:bg-brand-soft/30">
                    <td className="py-3 pr-3 whitespace-nowrap tabular-nums">{formatDateTime(r.waktu)}</td>
                    <td className="py-3 pr-3">
                      <div className="font-semibold">{r.user_nama || r.username || '—'}</div>
                      {r.username && r.user_nama && (
                        <div className="text-[11px] text-muted">@{r.username}</div>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5 text-muted" />
                        <span className="font-medium">{r.entitas}</span>
                        {r.entitas_id && <span className="text-muted">#{r.entitas_id}</span>}
                      </span>
                    </td>
                    <td className="py-3 pr-3"><Badge text={r.aksi} type={aksiType(r.aksi)} /></td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[12px]">
                        <Globe className="h-3.5 w-3.5 text-muted" />
                        {r.ip || '—'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end">
                        <Button
                          size="sm" variant="ghost" icon={<Eye className="h-3.5 w-3.5" />}
                          onClick={() => openDetail(r)}
                        >
                          Lihat
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.aksi} · ${detail.entitas}${detail.entitas_id ? ` #${detail.entitas_id}` : ''}` : 'Detail'}
        size="lg"
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>Tutup</Button>}
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow icon={<UserIcon className="h-4 w-4" />} label="Pengguna" value={detail.user_nama || detail.username || 'Sistem'} />
              <InfoRow icon={<History className="h-4 w-4" />} label="Waktu" value={formatDateTime(detail.waktu)} />
              <InfoRow icon={<Globe className="h-4 w-4" />} label="IP" value={detail.ip || '—'} />
              <InfoRow icon={<Database className="h-4 w-4" />} label="Entitas" value={`${detail.entitas}${detail.entitas_id ? ` #${detail.entitas_id}` : ''}`} />
            </div>
            {detail.user_agent && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">User Agent</div>
                <div className="rounded-lg bg-line/40 p-2.5 font-mono text-[11.5px] break-words">{detail.user_agent}</div>
              </div>
            )}
            {detail.sebelum != null && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Sebelum</div>
                <pre className={cn('max-h-56 overflow-auto rounded-lg bg-line/40 p-3 font-mono text-[11.5px]')}>
                  {JSON.stringify(detail.sebelum, null, 2)}
                </pre>
              </div>
            )}
            {detail.sesudah != null && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Sesudah</div>
                <pre className="max-h-56 overflow-auto rounded-lg bg-line/40 p-3 font-mono text-[11.5px]">
                  {JSON.stringify(detail.sesudah, null, 2)}
                </pre>
              </div>
            )}
            <p className="text-[11.5px] text-muted">Tema aktif: {theme === 'dark' ? 'Gelap' : 'Terang'}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-line/30 p-3">
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {icon} {label}
      </div>
      <div className="text-[13px] font-semibold">{value}</div>
    </div>
  );
}
