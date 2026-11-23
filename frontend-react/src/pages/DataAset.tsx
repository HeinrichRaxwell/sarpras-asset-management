import { useEffect, useMemo, useState } from 'react';
import { api, can } from '@/lib/api';
import { formatRupiah, formatDate, cn } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { Button, Field, Input, Select, Textarea, Modal, Badge, statusType, PageHeader, EmptyState, Skeleton } from '@/components/ui';
import { statusLabel } from '@/lib/api';
import {
  Package, Plus, Pencil, Trash2, Search, X, Eye, ChevronLeft, ChevronRight,
  SlidersHorizontal, HardDrive,
} from 'lucide-react';

interface Option { id: number; nama: string }
interface Aset {
  id: number;
  kode: string;
  nama: string;
  kategori_id?: number | null;
  lokasi_id?: number | null;
  sumber_dana_id?: number | null;
  status?: string;
  kondisi?: string;
  merk?: string | null;
  tipe?: string | null;
  no_seri?: string | null;
  nilai_perolehan?: number | string | null;
  tanggal_perolehan?: string | null;
  spesifikasi?: string | null;
  kategori_nama?: string;
  lokasi_nama?: string;
  sumber_dana_nama?: string;
}
interface Detail extends Aset {}
interface Meta { page: number; limit: number; total: number; totalPages: number }

const EMPTY: Partial<Aset> = { nama: '', status: 'Aktif', kondisi: 'Baik', nilai_perolehan: 0 };

export default function DataAset() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Aset[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [opts, setOpts] = useState<{ kategori: Option[]; lokasi: Option[]; dana: Option[] }>({ kategori: [], lokasi: [], dana: [] });

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState({ kategori_id: '', lokasi_id: '', status: '', kondisi: '' });
  const [page, setPage] = useState(1);

  const [form, setForm] = useState<Partial<Aset> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Aset | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void (async () => {
      try {
        const [k, l, d] = await Promise.all([
          api.get<Option[]>('/kategori?limit=1000'),
          api.get<Option[]>('/lokasi?limit=1000'),
          api.get<Option[]>('/sumber-dana?limit=1000').catch(() => ({ data: [] as Option[] })),
        ]);
        setOpts({ kategori: k.data ?? [], lokasi: l.data ?? [], dana: d.data ?? [] });
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    })();
  }, [toast]);

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: '10' });
      if (debounced) q.set('search', debounced);
      for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
      const res = await api.get<Aset[]>(`/aset?${q.toString()}`);
      setRows(res.data ?? []);
      if (res.meta) setMeta(res.meta);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [page, debounced, filters]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form?.nama?.trim()) e.nama = 'Nama aset wajib diisi';
    if (!form?.kategori_id) e.kategori_id = 'Kategori wajib dipilih';
    if (!form?.lokasi_id) e.lokasi_id = 'Lokasi wajib dipilih';
    if (form?.nilai_perolehan !== undefined && form.nilai_perolehan !== null && form.nilai_perolehan !== '' && Number(form.nilai_perolehan) < 0) e.nilai_perolehan = 'Nilai tidak boleh negatif';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        nama: form?.nama?.trim(),
        kategori_id: form?.kategori_id ? Number(form.kategori_id) : null,
        lokasi_id: form?.lokasi_id ? Number(form.lokasi_id) : null,
        sumber_dana_id: form?.sumber_dana_id ? Number(form.sumber_dana_id) : null,
        status: form?.status ?? 'Aktif',
        kondisi: form?.kondisi ?? 'Baik',
        merk: form?.merk || null,
        tipe: form?.tipe || null,
        no_seri: form?.no_seri || null,
        nilai_perolehan: form?.nilai_perolehan === '' || form?.nilai_perolehan == null ? 0 : Number(form.nilai_perolehan),
        tanggal_perolehan: form?.tanggal_perolehan || null,
        spesifikasi: form?.spesifikasi || null,
      };
      if (editingId) await api.put(`/aset/${encodeURIComponent(editingId)}`, payload);
      else await api.post('/aset', payload);
      toast(editingId ? 'Aset diperbarui' : 'Aset ditambahkan', 'success');
      setForm(null); setEditingId(null);
      void load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (kode: string) => {
    setDetailLoading(true); setDetail(null);
    try {
      const res = await api.get<{ aset: Detail }>(`/aset/${encodeURIComponent(kode)}/detail`);
      setDetail(res.data?.aset ?? null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const doDelete = async (hard: boolean) => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/aset/${encodeURIComponent(confirmDelete.kode)}${hard ? '?hard=true' : ''}`);
      toast(hard ? 'Aset dihapus permanen' : 'Aset dihapus (soft)', 'success');
      setConfirmDelete(null);
      void load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const activeFilters = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  const isAdmin = can('delete_master');

  const filterField = (label: string, key: keyof typeof filters, options: { value: string; label: string }[]) => (
    <Field label={label} className="min-w-[160px]">
      <Select value={filters[key]} onChange={(e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(1); }}>
        <option value="">Semua</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );

  return (
    <>
      <PageHeader
        title="Data Aset"
        subtitle={`Total ${meta.total} aset terdaftar`}
        action={can('write') && (
          <Button icon={<Plus className="h-4 w-4" strokeWidth={1.8} />} onClick={() => { setForm({ ...EMPTY }); setEditingId(null); setErrors({}); }}>
            Tambah Aset
          </Button>
        )}
      />

      <div className="glass rounded-2xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Cari" className="flex-1 min-w-[220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.8} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kode / nama / merk / serial..." className="pl-9" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn h-6 w-6" aria-label="Hapus pencarian">
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              )}
            </div>
          </Field>
          {filterField('Kategori', 'kategori_id', opts.kategori.map((k) => ({ value: String(k.id), label: k.nama })))}
          {filterField('Lokasi', 'lokasi_id', opts.lokasi.map((l) => ({ value: String(l.id), label: l.nama })))}
          {filterField('Status', 'status', ['Aktif', 'Dipinjam', 'Servis', 'Mutasi', 'Dihapus'].map((s) => ({ value: s, label: statusLabel(s) })))}
          {filterField('Kondisi', 'kondisi', ['Baik', 'Rusak Ringan', 'Rusak Berat'].map((s) => ({ value: s, label: s })))}
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" icon={<SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />} onClick={() => setFilters({ kategori_id: '', lokasi_id: '', status: '', kondisi: '' })}>
              Reset ({activeFilters})
            </Button>
          )}
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        {loading ? (
          <div className="p-5"><Skeleton rows={8} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Package className="h-9 w-9" strokeWidth={1.8} />} title="Belum ada aset" hint="Tambahkan aset pertama atau ubah filter pencarian." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-line">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-bold">Kode</th>
                    <th className="px-4 py-3 font-bold">Nama Aset</th>
                    <th className="px-4 py-3 font-bold">Kategori</th>
                    <th className="px-4 py-3 font-bold">Nilai Perolehan</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Kondisi</th>
                    <th className="px-4 py-3 font-bold">Tgl Perolehan</th>
                    <th className="px-4 py-3 text-right font-bold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-line transition hover:bg-brand-soft/30">
                      <td className="px-4 py-3 font-mono text-[12px]">{r.kode}</td>
                      <td className="px-4 py-3 font-semibold">{r.nama}</td>
                      <td className="px-4 py-3 text-muted">{opts.kategori.find((k) => k.id === r.kategori_id)?.nama ?? '-'}</td>
                      <td className="px-4 py-3 tabular-nums">{formatRupiah(r.nilai_perolehan)}</td>
                      <td className="px-4 py-3"><Badge text={statusLabel(r.status)} type={statusType(r.status ?? '')} /></td>
                      <td className="px-4 py-3"><Badge text={r.kondisi ?? '-'} type={statusType(r.kondisi ?? '')} /></td>
                      <td className="px-4 py-3 text-muted">{formatDate(r.tanggal_perolehan)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => void openDetail(r.kode)} className="icon-btn h-7 w-7" aria-label="Detail" title="Detail">
                            <Eye className="h-3.5 w-3.5" strokeWidth={1.8} />
                          </button>
                          {can('write') && (
                            <button onClick={() => { setForm({ ...r }); setEditingId(r.kode); setErrors({}); }} className="icon-btn h-7 w-7" aria-label="Edit" title="Edit">
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                            </button>
                          )}
                          {can('delete_master') && (
                            <button onClick={() => setConfirmDelete(r)} className="icon-btn h-7 w-7 text-danger hover:bg-danger/10" aria-label="Hapus" title="Hapus">
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12.5px] text-muted">
              <div>Halaman {meta.page} dari {meta.totalPages} · {meta.total} data</div>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} icon={<ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />}>Sebelumnya</Button>
                <Button variant="ghost" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}>
                  Berikutnya<ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={!!form}
        onClose={() => { setForm(null); setEditingId(null); }}
        title={editingId ? 'Edit Aset' : 'Tambah Aset'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setForm(null); setEditingId(null); }}>Batal</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nama Aset" required error={errors.nama} className="md:col-span-2">
            <Input value={form?.nama ?? ''} onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))} placeholder="Contoh: Laptop Lenovo ThinkPad T14" />
          </Field>
          <Field label="Kategori" required error={errors.kategori_id}>
            <Select value={form?.kategori_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, kategori_id: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">— Pilih kategori —</option>
              {opts.kategori.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </Select>
          </Field>
          <Field label="Lokasi" required error={errors.lokasi_id}>
            <Select value={form?.lokasi_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, lokasi_id: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">— Pilih lokasi —</option>
              {opts.lokasi.map((l) => <option key={l.id} value={l.id}>{l.nama}</option>)}
            </Select>
          </Field>
          <Field label="Sumber Dana">
            <Select value={form?.sumber_dana_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, sumber_dana_id: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">— Pilih sumber dana —</option>
              {opts.dana.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </Select>
          </Field>
          <Field label="Tanggal Perolehan">
            <Input type="date" value={form?.tanggal_perolehan?.slice(0, 10) ?? ''} onChange={(e) => setForm((f) => ({ ...f, tanggal_perolehan: e.target.value }))} />
          </Field>
          <Field label="Merk"><Input value={form?.merk ?? ''} onChange={(e) => setForm((f) => ({ ...f, merk: e.target.value }))} /></Field>
          <Field label="Tipe / Model"><Input value={form?.tipe ?? ''} onChange={(e) => setForm((f) => ({ ...f, tipe: e.target.value }))} /></Field>
          <Field label="Nomor Seri"><Input value={form?.no_seri ?? ''} onChange={(e) => setForm((f) => ({ ...f, no_seri: e.target.value }))} /></Field>
          <Field label="Nilai Perolehan (Rp)" error={errors.nilai_perolehan}>
            <Input type="number" min="0" step="1000" value={form?.nilai_perolehan ?? ''} onChange={(e) => setForm((f) => ({ ...f, nilai_perolehan: e.target.value === '' ? '' : Number(e.target.value) }))} />
          </Field>
          <Field label="Status">
            <Select value={form?.status ?? 'Aktif'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {['Aktif', 'Dipinjam', 'Servis', 'Mutasi', 'Dihapus'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
          </Field>
          <Field label="Kondisi">
            <Select value={form?.kondisi ?? 'Baik'} onChange={(e) => setForm((f) => ({ ...f, kondisi: e.target.value }))}>
              {['Baik', 'Rusak Ringan', 'Rusak Berat'].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Spesifikasi" className="md:col-span-2">
            <Textarea value={form?.spesifikasi ?? ''} onChange={(e) => setForm((f) => ({ ...f, spesifikasi: e.target.value }))} placeholder="Catatan tambahan..." />
          </Field>
        </div>
      </Modal>

      {/* Detail drawer */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="glass h-full w-full max-w-lg overflow-y-auto rounded-l-[1.25rem] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-[11.5px] text-muted">{detail?.kode}</div>
                <h3 className="text-xl font-extrabold tracking-tight">{detail?.nama ?? 'Memuat...'}</h3>
                <div className="mt-2 flex gap-1.5">
                  {detail?.status && <Badge text={statusLabel(detail.status)} type={statusType(detail.status)} />}
                  {detail?.kondisi && <Badge text={detail.kondisi} type={statusType(detail.kondisi)} />}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="icon-btn" aria-label="Tutup"><X className="h-4 w-4" strokeWidth={1.8} /></button>
            </div>
            {detailLoading || !detail ? (
              <Skeleton rows={8} />
            ) : (
              <dl className="space-y-3 text-[13px]">
                {[
                  ['Kategori', detail.kategori_nama ?? '-'],
                  ['Lokasi', detail.lokasi_nama ?? '-'],
                  ['Sumber Dana', detail.sumber_dana_nama ?? '-'],
                  ['Merk', detail.merk || '-'],
                  ['Tipe / Model', detail.tipe || '-'],
                  ['Nomor Seri', detail.no_seri || '-'],
                  ['Nilai Perolehan', formatRupiah(detail.nilai_perolehan)],
                  ['Tanggal Perolehan', formatDate(detail.tanggal_perolehan)],
                  ['Spesifikasi', detail.spesifikasi || '-'],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-4 border-b border-line pb-2.5">
                    <dt className="font-semibold text-muted">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Hapus Aset" size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="danger" onClick={() => void doDelete(false)}>Hapus (Soft)</Button>
            {isAdmin && <Button variant="danger" onClick={() => void doDelete(true)} className={cn('')}>Hapus Permanen</Button>}
          </>
        }
      >
        <div className="flex items-start gap-3">
          <HardDrive className="h-5 w-5 shrink-0 text-danger" strokeWidth={1.8} />
          <p className="text-[13px]">
            Yakin hapus <strong>{confirmDelete?.nama}</strong> (<span className="font-mono">{confirmDelete?.kode}</span>)? Soft delete menandai aset sebagai <em>Dihapus</em>; permanen menghapus baris dari basis data dan tidak dapat dibatalkan.
          </p>
        </div>
      </Modal>
    </>
  );
}
