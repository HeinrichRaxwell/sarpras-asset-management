import { useEffect, useState } from 'react';
import { api, can } from '@/lib/api';
import { formatRupiah, formatDate } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { Button, Field, Input, Select, Modal, Badge, statusType, PageHeader, EmptyState, Skeleton } from '@/components/ui';
import {
  Warehouse, CheckCircle2, XCircle, ChevronLeft, ChevronRight, PackageCheck,
} from 'lucide-react';

interface Option { id: number; nama: string }
interface GudangItem {
  id: number;
  kode_barang?: string;
  nama_barang: string;
  qty: number;
  satuan?: string;
  kondisi?: string;
  status?: string;
  catatan?: string;
  created_at?: string;
  pemasok?: string;
}
interface Meta { page: number; limit: number; total: number; totalPages: number }

export default function GudangTransit() {
  const { toast } = useToast();
  const [rows, setRows] = useState<GudangItem[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [qcTarget, setQcTarget] = useState<GudangItem | null>(null);
  const [qcResult, setQcResult] = useState<'Lolos' | 'Ditolak'>('Lolos');
  const [qcForm, setQcForm] = useState({ kategori_id: '', lokasi_id: '', sumber_dana_id: '', nilai_perolehan: '', catatan: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [opts, setOpts] = useState<{ kategori: Option[]; lokasi: Option[]; dana: Option[] }>({ kategori: [], lokasi: [], dana: [] });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<GudangItem[]>(`/gudang?page=${page}&limit=10`);
      setRows(res.data ?? []);
      if (res.meta) setMeta(res.meta);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [page]);

  useEffect(() => {
    void (async () => {
      const safe = async <T,>(p: string): Promise<T> => { try { const r = await api.get<T>(p); return (r.data ?? []) as T; } catch { return [] as T; } };
      const [k, l, d] = await Promise.all([
        safe<Option[]>('/kategori?limit=1000'),
        safe<Option[]>('/lokasi?limit=1000'),
        safe<Option[]>('/sumber-dana?limit=1000'),
      ]);
      setOpts({ kategori: k, lokasi: l, dana: d });
    })();
  }, []);

  const openQc = (item: GudangItem, result: 'Lolos' | 'Ditolak') => {
    setQcTarget(item);
    setQcResult(result);
    setQcForm({ kategori_id: '', lokasi_id: '', sumber_dana_id: '', nilai_perolehan: '', catatan: '' });
    setErrors({});
  };

  const submitQc = async () => {
    if (!qcTarget) return;
    const e: Record<string, string> = {};
    if (qcResult === 'Lolos') {
      if (!qcForm.kategori_id) e.kategori_id = 'Kategori wajib dipilih';
      if (!qcForm.lokasi_id) e.lokasi_id = 'Lokasi wajib dipilih';
      if (qcForm.nilai_perolehan === '' || Number(qcForm.nilai_perolehan) < 0) e.nilai_perolehan = 'Nilai perolehan wajib diisi (≥ 0)';
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      const body = qcResult === 'Lolos'
        ? {
            hasil: 'Lolos',
            kategori_id: Number(qcForm.kategori_id),
            lokasi_id: Number(qcForm.lokasi_id),
            sumber_dana_id: qcForm.sumber_dana_id ? Number(qcForm.sumber_dana_id) : null,
            nilai_perolehan: Number(qcForm.nilai_perolehan),
            catatan: qcForm.catatan || null,
          }
        : { hasil: 'Ditolak', catatan: qcForm.catatan || null };
      await api.patch(`/gudang/${qcTarget.id}/qc`, body);
      toast(qcResult === 'Lolos' ? 'Barang lolos QC & dipromosikan jadi aset' : 'Barang ditolak', 'success');
      setQcTarget(null);
      void load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Gudang Transit (QC)" subtitle="Barang masuk menunggu Quality Control sebelum dipromosikan menjadi aset." />

      <div className="glass overflow-hidden rounded-2xl">
        {loading ? (
          <div className="p-5"><Skeleton rows={8} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Warehouse className="h-9 w-9" strokeWidth={1.8} />} title="Antrian kosong" hint="Belum ada barang di gudang transit." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-line">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-bold">Kode</th>
                    <th className="px-4 py-3 font-bold">Nama Barang</th>
                    <th className="px-4 py-3 font-bold">Jumlah</th>
                    <th className="px-4 py-3 font-bold">Kondisi</th>
                    <th className="px-4 py-3 font-bold">Pemasok</th>
                    <th className="px-4 py-3 font-bold">Tgl Masuk</th>
                    <th className="px-4 py-3 text-right font-bold">Keputusan QC</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-line transition hover:bg-brand-soft/30">
                      <td className="px-4 py-3 font-mono text-[12px]">{r.kode_barang ?? `GDG-${r.id}`}</td>
                      <td className="px-4 py-3 font-semibold">{r.nama_barang}</td>
                      <td className="px-4 py-3">{r.qty} {r.satuan ?? ''}</td>
                      <td className="px-4 py-3"><Badge text={r.kondisi ?? '-'} type={statusType(r.kondisi ?? '')} /></td>
                      <td className="px-4 py-3 text-muted">{r.pemasok ?? '-'}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" disabled={!can('approve')} icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />} onClick={() => openQc(r, 'Lolos')}>
                            Lolos
                          </Button>
                          <Button size="sm" variant="ghost" disabled={!can('approve')} icon={<XCircle className="h-3.5 w-3.5" strokeWidth={1.8} />} onClick={() => openQc(r, 'Ditolak')}>
                            Ditolak
                          </Button>
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

      <Modal
        open={!!qcTarget}
        onClose={() => setQcTarget(null)}
        title={qcResult === 'Lolos' ? 'Setujui QC & Promosikan jadi Aset' : 'Tolak Barang'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setQcTarget(null)}>Batal</Button>
            <Button variant={qcResult === 'Lolos' ? 'primary' : 'danger'} onClick={() => void submitQc()} disabled={saving}>
              {saving ? 'Menyimpan...' : qcResult === 'Lolos' ? 'Promosikan jadi Aset' : 'Tolak Barang'}
            </Button>
          </>
        }
      >
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-brand-soft/40 p-3 text-[13px]">
          <PackageCheck className="h-5 w-5 shrink-0 text-brand" strokeWidth={1.8} />
          <div>
            <div className="font-semibold">{qcTarget?.nama_barang}</div>
            <div className="text-[12px] text-muted">{qcTarget?.qty} {qcTarget?.satuan ?? ''} · {qcTarget?.kode_barang ?? `GDG-${qcTarget?.id}`}</div>
          </div>
        </div>

        <Field label="Hasil QC" className="mb-4">
          <Select value={qcResult} onChange={(e) => setQcResult(e.target.value as 'Lolos' | 'Ditolak')}>
            <option value="Lolos">Lolos — jadikan aset</option>
            <option value="Ditolak">Ditolak — kembalikan / musnahkan</option>
          </Select>
        </Field>

        {qcResult === 'Lolos' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Kategori Aset" required error={errors.kategori_id}>
              <Select value={qcForm.kategori_id} onChange={(e) => setQcForm((f) => ({ ...f, kategori_id: e.target.value }))}>
                <option value="">— Pilih kategori —</option>
                {opts.kategori.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </Select>
            </Field>
            <Field label="Lokasi Penempatan" required error={errors.lokasi_id}>
              <Select value={qcForm.lokasi_id} onChange={(e) => setQcForm((f) => ({ ...f, lokasi_id: e.target.value }))}>
                <option value="">— Pilih lokasi —</option>
                {opts.lokasi.map((l) => <option key={l.id} value={l.id}>{l.nama}</option>)}
              </Select>
            </Field>
            <Field label="Sumber Dana">
              <Select value={qcForm.sumber_dana_id} onChange={(e) => setQcForm((f) => ({ ...f, sumber_dana_id: e.target.value }))}>
                <option value="">— Pilih sumber dana —</option>
                {opts.dana.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
              </Select>
            </Field>
            <Field label="Nilai Perolehan (Rp)" required error={errors.nilai_perolehan}>
              <Input type="number" min="0" step="1000" value={qcForm.nilai_perolehan} onChange={(e) => setQcForm((f) => ({ ...f, nilai_perolehan: e.target.value }))} placeholder="0" />
              {qcForm.nilai_perolehan && <div className="text-[11.5px] text-muted">{formatRupiah(qcForm.nilai_perolehan)}</div>}
            </Field>
          </div>
        )}

        <Field label="Catatan QC" className="mt-4">
          <Input value={qcForm.catatan} onChange={(e) => setQcForm((f) => ({ ...f, catatan: e.target.value }))} placeholder="Keterangan hasil pemeriksaan..." />
        </Field>
      </Modal>
    </>
  );
}
