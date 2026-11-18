import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, CalendarClock, AlertTriangle, Plus, Pencil, RefreshCw,
  Search, ChevronLeft, ChevronRight, Wrench, CircleCheck,
} from 'lucide-react';
import { api, can } from '@/lib/api';
import { cn, formatDate, formatRupiah } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import {
  Button, Field, Input, Textarea, Modal, Badge, PageHeader,
  EmptyState, Skeleton, statusType,
} from '@/components/ui';
import { useToast } from '@/context/ToastContext';

type ServisStatus = 'Antri' | 'Proses' | 'Selesai';

interface Servis {
  id: number;
  aset_kode: string;
  jenis: 'Kuratif' | 'Preventif';
  tanggal: string;
  jadwal_berikutnya: string | null;
  masalah: string | null;
  tindakan: string | null;
  biaya: string;
  vendor: string | null;
  status: ServisStatus;
}

const PAGE_SIZE = 10;
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (s: Servis) =>
  !!s.jadwal_berikutnya && s.jadwal_berikutnya <= today() && s.status !== 'Selesai';

const emptyForm = {
  aset_kode: '',
  tanggal: today(),
  jadwal_berikutnya: '',
  masalah: '',
  tindakan: '',
  biaya: '0',
  vendor: '',
};

export default function ServisPreventif() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [rows, setRows] = useState<Servis[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Servis[]>(
        `/servis?jenis=Preventif&page=${page}&limit=${PAGE_SIZE}` +
        (search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '')
      );
      setRows(res.data ?? []);
      setTotalPages(res.meta?.totalPages ?? 1);
      setTotal(res.meta?.total ?? 0);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const overdueCount = useMemo(() => rows.filter(isOverdue).length, [rows]);
  const doneCount = useMemo(() => rows.filter((r) => r.status === 'Selesai').length, [rows]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.aset_kode.trim()) {
      setError('Kode aset wajib diisi');
      return;
    }
    if (!form.jadwal_berikutnya) {
      setError('Jadwal berikutnya wajib diisi untuk servis preventif');
      return;
    }
    setSaving(true);
    try {
      await api.post('/servis', {
        aset_kode: form.aset_kode.trim(),
        jenis: 'Preventif',
        tanggal: form.tanggal || today(),
        jadwal_berikutnya: form.jadwal_berikutnya,
        masalah: form.masalah || null,
        tindakan: form.tindakan || null,
        biaya: Number(form.biaya) || 0,
        vendor: form.vendor || null,
      });
      toast('Jadwal preventif berhasil dibuat', 'success');
      setModalOpen(false);
      setForm(emptyForm);
      fetchList();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: number, status: ServisStatus) => {
    try {
      await api.patch(`/servis/${id}/status`, { status });
      toast(`Status servis #${id} → ${status}`, 'success');
      fetchList();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Servis Preventif"
        subtitle="Rencanakan dan pantau jadwal perawatan berkala aset"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              icon={<RefreshCw className="h-4 w-4" strokeWidth={1.8} />}
              onClick={fetchList}
              aria-label="Muat ulang"
            >
              Muat ulang
            </Button>
            <Button
              icon={<Plus className="h-4 w-4" strokeWidth={1.8} />}
              onClick={() => { setForm(emptyForm); setError(''); setModalOpen(true); }}
              disabled={!can('read')}
            >
              Jadwal Baru
            </Button>
          </div>
        }
      />

      {/* Stat ringkas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Total Jadwal</div>
              <div className="text-xl font-extrabold">{loading ? '—' : total}</div>
            </div>
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-warning/15 text-warning">
              <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Jatuh Tempo (halaman ini)</div>
              <div className="text-xl font-extrabold">{loading ? '—' : overdueCount}</div>
            </div>
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-success/15 text-success">
              <CircleCheck className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Selesai (halaman ini)</div>
              <div className="text-xl font-extrabold">{loading ? '—' : doneCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className="glass rounded-2xl p-5">
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.8} />
            <Input
              placeholder="Cari kode aset / vendor…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
              aria-label="Cari servis preventif"
            />
          </div>
          <div className="ml-auto flex items-center gap-2 text-[12px] text-muted">
            <span>Halaman {page} / {totalPages}</span>
            <button
              className="icon-btn" aria-label="Sebelumnya" disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
            </button>
            <button
              className="icon-btn" aria-label="Berikutnya" disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-8 w-8" strokeWidth={1.8} />}
            title="Belum ada jadwal preventif"
            hint="Klik “Jadwal Baru” untuk membuat rencana perawatan berkala."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2.5.5 pr-3 font-semibold">Aset</th>
                  <th className="py-2.5.5 pr-3 font-semibold">Terakhir</th>
                  <th className="py-2.5.5 pr-3 font-semibold">Jadwal Berikutnya</th>
                  <th className="py-2.5.5 pr-3 font-semibold">Vendor</th>
                  <th className="py-2.5.5 pr-3 font-semibold text-right">Biaya</th>
                  <th className="py-2.5.5 pr-3 font-semibold">Status</th>
                  <th className="py-2.5.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const late = isOverdue(r);
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'border-b border-line/60 last:border-0 transition-colors hover:bg-brand-soft/40',
                        late && 'bg-danger/[0.06]'
                      )}
                    >
                      <td className="py-3 pr-3 font-semibold">
                        <div className="flex items-center gap-2">
                          {late && <AlertTriangle className="h-4 w-4 shrink-0 text-danger" strokeWidth={1.8} />}
                          {r.aset_kode}
                        </div>
                        {r.masalah && (
                          <div className="mt-0.5 line-clamp-1 text-[11.5px] text-muted">{r.masalah}</div>
                        )}
                      </td>
                      <td className="py-3 pr-3">{formatDate(r.tanggal)}</td>
                      <td className={cn('py-3 pr-3', late && 'font-bold text-danger')}>
                        {r.jadwal_berikutnya ? formatDate(r.jadwal_berikutnya) : '—'}
                        {late && <div className="text-[11px] font-semibold">Jatuh tempo</div>}
                      </td>
                      <td className="py-3 pr-3">{r.vendor || '—'}</td>
                      <td className="py-3 pr-3 text-right tabular-nums">{formatRupiah(r.biaya)}</td>
                      <td className="py-3 pr-3"><Badge text={r.status} type={statusType(r.status)} /></td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1.5">
                          {r.status === 'Antri' && (
                            <Button
                              size="sm" variant="ghost" icon={<Wrench className="h-3.5 w-3.5" strokeWidth={1.8} />}
                              onClick={() => updateStatus(r.id, 'Proses')}
                            >
                              Mulai
                            </Button>
                          )}
                          {r.status === 'Proses' && (
                            <Button
                              size="sm" icon={<CircleCheck className="h-3.5 w-3.5" strokeWidth={1.8} />}
                              onClick={() => updateStatus(r.id, 'Selesai')}
                            >
                              Selesai
                            </Button>
                          )}
                          {r.status === 'Selesai' && (
                            <Button
                              size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />}
                              onClick={() => updateStatus(r.id, 'Antri')}
                            >
                              Buka ulang
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal create */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Jadwal Servis Preventif"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" form="form-preventif" disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </>
        }
      >
        <form id="form-preventif" onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <div className="rounded-[10px] bg-danger/12 px-3 py-2.5 text-[12.5px] font-medium text-danger">{error}</div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kode Aset" required>
              <Input
                value={form.aset_kode}
                onChange={(e) => setForm({ ...form, aset_kode: e.target.value })}
                placeholder="AST-0001"
              />
            </Field>
            <Field label="Tanggal Pelaksanaan">
              <Input
                type="date"
                value={form.tanggal}
                onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
              />
            </Field>
            <Field label="Jadwal Berikutnya" required>
              <Input
                type="date"
                value={form.jadwal_berikutnya}
                onChange={(e) => setForm({ ...form, jadwal_berikutnya: e.target.value })}
              />
            </Field>
            <Field label="Vendor">
              <Input
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                placeholder="PT. Pemeliharaan Jaya"
              />
            </Field>
          </div>
          <Field label="Masalah / Rencana Pekerjaan">
            <Textarea
              value={form.masalah}
              onChange={(e) => setForm({ ...form, masalah: e.target.value })}
              placeholder="Kalibrasi AC ruang server, ganti filter…"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tindakan">
              <Input
                value={form.tindakan}
                onChange={(e) => setForm({ ...form, tindakan: e.target.value })}
              />
            </Field>
            <Field label="Biaya (Rp)">
              <Input
                type="number" min={0} step={1000}
                value={form.biaya}
                onChange={(e) => setForm({ ...form, biaya: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-[11.5px] text-muted">Tema aktif: {theme === 'dark' ? 'Gelap' : 'Terang'}</p>
        </form>
      </Modal>
    </div>
  );
}
