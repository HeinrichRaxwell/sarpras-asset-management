import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Plus, Play, CheckCircle2, RefreshCw, ChevronLeft,
  ChevronRight, ArrowLeft, Search, MapPin, Package,
} from 'lucide-react';
import { api, can } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import {
  Button, Field, Input, Select, Textarea, Modal, Badge, PageHeader,
  EmptyState, Skeleton,
} from '@/components/ui';
import { useToast } from '@/context/ToastContext';

interface Sesi {
  id: number;
  kode: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string | null;
  status: 'Berjalan' | 'Selesai';
  dijalankan_oleh_nama: string | null;
  jumlah_item: number;
}

interface OpnameItem {
  id: number;
  aset_kode: string;
  aset_nama: string | null;
  ditemukan: boolean;
  kondisi_fisik: string | null;
  lokasi_temuan: string | null;
  catatan: string | null;
}

interface Lokasi { id: number; nama: string }

const emptyItem = {
  aset_kode: '',
  ditemukan: 'true' as 'true' | 'false',
  kondisi_fisik: '' as '' | 'Baik' | 'Rusak Ringan' | 'Rusak Berat',
  lokasi_temuan_id: '',
  catatan: '',
};

export default function Verifikasi() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [sesi, setSesi] = useState<Sesi[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Sesi | null>(null);
  const [items, setItems] = useState<OpnameItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [form, setForm] = useState({ kode: '', nama: '', tanggal_mulai: new Date().toISOString().slice(0, 10) });
  const [itemForm, setItemForm] = useState(emptyItem);
  const [lokasi, setLokasi] = useState<Lokasi[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchSesi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Sesi[]>(
        `/verifikasi?page=${page}&limit=10` +
        (search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '')
      );
      setSesi(res.data ?? []);
      setTotalPages(res.meta?.totalPages ?? 1);
      setTotal(res.meta?.total ?? 0);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  const fetchItems = useCallback(async (id: number) => {
    setItemsLoading(true);
    try {
      const res = await api.get<OpnameItem[]>(`/verifikasi/${id}/items`);
      setItems(res.data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setItemsLoading(false);
    }
  }, [toast]);

  const fetchLokasi = useCallback(async () => {
    try {
      const res = await api.get<Lokasi[]>('/lokasi?limit=200');
      setLokasi(res.data ?? []);
    } catch { /* filter dropdown optional */ }
  }, []);

  useEffect(() => { fetchSesi(); }, [fetchSesi]);
  useEffect(() => { fetchLokasi(); }, [fetchLokasi]);

  const openDetail = (s: Sesi) => {
    setSelected(s);
    fetchItems(s.id);
  };

  const closeDetail = () => {
    setSelected(null);
    setItems([]);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.kode.trim() || !form.nama.trim()) {
      setError('Kode dan nama sesi wajib diisi');
      return;
    }
    setSaving(true);
    try {
      await api.post('/verifikasi', {
        kode: form.kode.trim(),
        nama: form.nama.trim(),
        tanggal_mulai: form.tanggal_mulai || undefined,
      });
      toast('Sesi opname dibuat', 'success');
      setCreateOpen(false);
      setForm({ kode: '', nama: '', tanggal_mulai: new Date().toISOString().slice(0, 10) });
      fetchSesi();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const finishSession = async (s: Sesi) => {
    try {
      await api.patch(`/verifikasi/${s.id}/finish`);
      toast(`Sesi ${s.kode} ditutup`, 'success');
      fetchSesi();
      if (selected?.id === s.id) setSelected({ ...s, status: 'Selesai' });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const submitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selected) return;
    if (!itemForm.aset_kode.trim()) {
      setError('Kode aset wajib diisi');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/verifikasi/${selected.id}/items`, {
        aset_kode: itemForm.aset_kode.trim(),
        ditemukan: itemForm.ditemukan === 'true',
        kondisi_fisik: itemForm.kondisi_fisik || null,
        lokasi_temuan_id: itemForm.lokasi_temuan_id ? Number(itemForm.lokasi_temuan_id) : null,
        catatan: itemForm.catatan || null,
      });
      toast('Hasil opname dicatat', 'success');
      setRecordOpen(false);
      setItemForm(emptyItem);
      fetchItems(selected.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const ditemukan = items.filter((i) => i.ditemukan).length;
    return { total: items.length, ditemukan, hilang: items.length - ditemukan };
  }, [items]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventarisasi Fisik"
        subtitle="Kelola sesi stock opname dan rekonsiliasi fisik vs data"
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={fetchSesi} aria-label="Muat ulang">
              Muat ulang
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setError(''); setCreateOpen(true); }} disabled={!can('read')}>
              Sesi Baru
            </Button>
          </div>
        }
      />

      {!selected ? (
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                placeholder="Cari kode / nama sesi…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
                aria-label="Cari sesi opname"
              />
            </div>
            <div className="ml-auto flex items-center gap-2 text-[12px] text-muted">
              <span>Halaman {page} / {totalPages} · {total} sesi</span>
              <button className="icon-btn" aria-label="Sebelumnya" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="icon-btn" aria-label="Berikutnya" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <Skeleton rows={6} />
          ) : sesi.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-8 w-8" />}
              title="Belum ada sesi opname"
              hint="Klik “Sesi Baru” untuk memulai inventarisasi fisik."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="py-2.5 pr-3 font-bold">Kode</th>
                    <th className="py-2.5 pr-3 font-bold">Nama</th>
                    <th className="py-2.5 pr-3 font-bold">Mulai</th>
                    <th className="py-2.5 pr-3 font-bold">Selesai</th>
                    <th className="py-2.5 pr-3 font-bold">Petugas</th>
                    <th className="py-2.5 pr-3 text-center font-bold">Item</th>
                    <th className="py-2.5 pr-3 font-bold">Status</th>
                    <th className="py-2.5 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {sesi.map((s) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer border-b border-line/60 last:border-0 transition-colors hover:bg-brand-soft/40"
                      onClick={() => openDetail(s)}
                    >
                      <td className="py-3 pr-3 font-semibold">{s.kode}</td>
                      <td className="py-3 pr-3">{s.nama}</td>
                      <td className="py-3 pr-3">{formatDate(s.tanggal_mulai)}</td>
                      <td className="py-3 pr-3">{s.tanggal_selesai ? formatDate(s.tanggal_selesai) : '—'}</td>
                      <td className="py-3 pr-3">{s.dijalankan_oleh_nama || '—'}</td>
                      <td className="py-3 pr-3 text-center tabular-nums">{s.jumlah_item}</td>
                      <td className="py-3 pr-3">
                        <Badge text={s.status} type={s.status === 'Selesai' ? 'ok' : 'info'} />
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {s.status === 'Berjalan' ? (
                            <>
                              <Button
                                size="sm" icon={<Play className="h-3.5 w-3.5" />}
                                onClick={() => openDetail(s)}
                              >
                                Mulai
                              </Button>
                              <Button
                                size="sm" variant="ghost" icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                                onClick={() => finishSession(s)}
                              >
                                Selesai
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => openDetail(s)}>Detail</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={closeDetail}>
                Kembali
              </Button>
              <div>
                <h3 className="text-lg font-bold tracking-tight">{selected.nama}</h3>
                <p className="text-[12.5px] text-muted">
                  {selected.kode} · Mulai {formatDate(selected.tanggal_mulai)}
                  {selected.tanggal_selesai && ` · Selesai ${formatDate(selected.tanggal_selesai)}`}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Badge text={selected.status} type={selected.status === 'Selesai' ? 'ok' : 'info'} />
                {selected.status === 'Berjalan' && (
                  <Button
                    size="sm" variant="danger" icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    onClick={() => finishSession(selected)}
                  >
                    Selesaikan Sesi
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-brand-soft/50 p-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Total Dicatat</div>
                <div className="text-xl font-extrabold">{itemsLoading ? '—' : stats.total}</div>
              </div>
              <div className="rounded-xl bg-success/10 p-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-success">Ditemukan</div>
                <div className="text-xl font-extrabold text-success">{itemsLoading ? '—' : stats.ditemukan}</div>
              </div>
              <div className="rounded-xl bg-danger/10 p-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-danger">Hilang</div>
                <div className="text-xl font-extrabold text-danger">{itemsLoading ? '—' : stats.hilang}</div>
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h4 className="text-[15px] font-bold">Hasil Opname</h4>
              {selected.status === 'Berjalan' && (
                <Button
                  size="sm" icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => { setError(''); setItemForm(emptyItem); setRecordOpen(true); }}
                  disabled={!can('read')}
                >
                  Catat Hasil
                </Button>
              )}
            </div>

            {itemsLoading ? (
              <Skeleton rows={5} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={<Package className="h-8 w-8" />}
                title="Belum ada item opname"
                hint="Catat hasil pengecekan fisik untuk setiap aset."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="py-2.5 pr-3 font-bold">Aset</th>
                      <th className="py-2.5 pr-3 font-bold">Hasil</th>
                      <th className="py-2.5 pr-3 font-bold">Kondisi Fisik</th>
                      <th className="py-2.5 pr-3 font-bold">Lokasi Temuan</th>
                      <th className="py-2.5 font-bold">Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b border-line/60 last:border-0">
                        <td className="py-3 pr-3">
                          <div className="font-semibold">{it.aset_kode}</div>
                          {it.aset_nama && <div className="text-[11.5px] text-muted">{it.aset_nama}</div>}
                        </td>
                        <td className="py-3 pr-3">
                          <Badge text={it.ditemukan ? 'Ditemukan' : 'Hilang'} type={it.ditemukan ? 'ok' : 'bad'} />
                        </td>
                        <td className="py-3 pr-3">{it.kondisi_fisik || '—'}</td>
                        <td className="py-3 pr-3">
                          {it.lokasi_temuan ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-muted" /> {it.lokasi_temuan}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3 text-muted">{it.catatan || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal create session */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Sesi Opname Baru"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button type="submit" form="form-sesi" disabled={saving}>{saving ? 'Menyimpan…' : 'Buat Sesi'}</Button>
          </>
        }
      >
        <form id="form-sesi" onSubmit={submitCreate} className="space-y-4" noValidate>
          {error && <div className="rounded-[10px] bg-danger/12 px-3 py-2.5 text-[12.5px] font-medium text-danger">{error}</div>}
          <Field label="Kode Sesi" required>
            <Input value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} placeholder="OPN-2026-Q1" />
          </Field>
          <Field label="Nama Sesi" required>
            <Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Opname Gudang Utama Q1" />
          </Field>
          <Field label="Tanggal Mulai">
            <Input type="date" value={form.tanggal_mulai} onChange={(e) => setForm({ ...form, tanggal_mulai: e.target.value })} />
          </Field>
          <p className="text-[11.5px] text-muted">Tema aktif: {theme === 'dark' ? 'Gelap' : 'Terang'}</p>
        </form>
      </Modal>

      {/* Modal record item */}
      <Modal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        title={`Catat Hasil — ${selected?.kode ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecordOpen(false)}>Batal</Button>
            <Button type="submit" form="form-item" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </>
        }
      >
        <form id="form-item" onSubmit={submitItem} className="space-y-4" noValidate>
          {error && <div className="rounded-[10px] bg-danger/12 px-3 py-2.5 text-[12.5px] font-medium text-danger">{error}</div>}
          <Field label="Kode Aset" required>
            <Input value={itemForm.aset_kode} onChange={(e) => setItemForm({ ...itemForm, aset_kode: e.target.value })} placeholder="AST-0001" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ditemukan?" required>
              <Select value={itemForm.ditemukan} onChange={(e) => setItemForm({ ...itemForm, ditemukan: e.target.value as 'true' | 'false' })}>
                <option value="true">Ditemukan</option>
                <option value="false">Hilang</option>
              </Select>
            </Field>
            <Field label="Kondisi Fisik">
              <Select value={itemForm.kondisi_fisik} onChange={(e) => setItemForm({ ...itemForm, kondisi_fisik: e.target.value as typeof itemForm.kondisi_fisik })}>
                <option value="">— pilih —</option>
                <option value="Baik">Baik</option>
                <option value="Rusak Ringan">Rusak Ringan</option>
                <option value="Rusak Berat">Rusak Berat</option>
              </Select>
            </Field>
          </div>
          <Field label="Lokasi Temuan">
            <Select value={itemForm.lokasi_temuan_id} onChange={(e) => setItemForm({ ...itemForm, lokasi_temuan_id: e.target.value })}>
              <option value="">— pilih lokasi —</option>
              {lokasi.map((l) => (
                <option key={l.id} value={l.id}>{l.nama}</option>
              ))}
            </Select>
          </Field>
          <Field label="Catatan">
            <Textarea value={itemForm.catatan} onChange={(e) => setItemForm({ ...itemForm, catatan: e.target.value })} placeholder="Kondisi baik, label terpasang…" />
          </Field>
        </form>
      </Modal>

    </div>
  );
}
