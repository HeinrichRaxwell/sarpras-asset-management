import { useCallback, useEffect, useState } from 'react';
import { api, can } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatRupiah, formatDate } from '@/lib/utils';
import { PageHeader, Button, Modal, Field, Input, Textarea, Select, Badge, statusType, EmptyState, Skeleton } from '@/components/ui';
import { Trash2, Plus, CheckCircle2, Info, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

type Metode = 'Musnah' | 'Lelang' | 'Hibah';
interface PenghapusanRow {
  id: number;
  aset_kode: string;
  aset_nama?: string | null;
  metode: Metode;
  tanggal: string;
  nilai_buku: string | number;
  nilai_lelang: string | number | null;
  alasan: string | null;
  status: 'Usulan' | 'Disetujui' | 'Ditolak';
  disetujui_oleh: number | null;
}
const EMPTY = { aset_kode: '', metode: 'Musnah' as Metode, tanggal: '', nilai_buku: '', nilai_lelang: '', alasan: '' };

export default function Penghapusan() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PenghapusanRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [ketentuan, setKetentuan] = useState('');
  const canApprove = can('approve');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: '10' });
      if (status) q.set('status', status);
      const res = await api.get<PenghapusanRow[]>(`/penghapusan?${q}`);
      setRows(res.data ?? []);
      if (res.meta) setMeta({ page: res.meta.page, totalPages: res.meta.totalPages, total: res.meta.total });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, status, toast]);

  useEffect(() => { load(); }, [load]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.aset_kode.trim()) e.aset_kode = 'Kode aset wajib diisi';
    if (!form.metode) e.metode = 'Pilih metode penghapusan';
    if (form.metode === 'Lelang' && form.nilai_lelang && isNaN(Number(form.nilai_lelang))) e.nilai_lelang = 'Nilai lelang harus angka';
    if (form.nilai_buku && isNaN(Number(form.nilai_buku))) e.nilai_buku = 'Nilai buku harus angka';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        aset_kode: form.aset_kode.trim(),
        metode: form.metode,
      };
      if (form.tanggal) body.tanggal = form.tanggal;
      if (form.nilai_buku) body.nilai_buku = Number(form.nilai_buku);
      if (form.metode === 'Lelang' && form.nilai_lelang) body.nilai_lelang = Number(form.nilai_lelang);
      if (form.alasan.trim()) body.alasan = form.alasan.trim();
      const res = await api.post<{ id: number }>('/penghapusan', body);
      const k = (res as unknown as { ketentuan_penghapusan?: string }).ketentuan_penghapusan;
      if (k) setKetentuan(k);
      toast(k ? `Usulan dibuat. ${k}` : 'Usulan penghapusan dibuat', k ? 'info' : 'success');
      setModal(false);
      setForm(EMPTY);
      setErrors({});
      setPage(1);
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const approve = async (row: PenghapusanRow) => {
    if (!window.confirm(`Setujui penghapusan aset ${row.aset_kode} (${row.metode})? Aset akan berstatus Dihapus.`)) return;
    try {
      const res = await api.patch(`/penghapusan/${row.id}/approve`);
      const k = (res as unknown as { ketentuan_penghapusan?: string }).ketentuan_penghapusan;
      if (k) setKetentuan(k);
      toast(k ? `Penghapusan disetujui. ${k}` : 'Penghapusan disetujui', k ? 'info' : 'success');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Penghapusan & Lelang"
        subtitle="Usulkan dan setujui penghapusan aset (Musnah / Lelang / Hibah)."
        action={(
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setForm(EMPTY); setErrors({}); setModal(true); }}>
            Usulkan Penghapusan
          </Button>
        )}
      />

      {ketentuan && (
        <div className="glass flex items-start gap-3 rounded-2xl p-4 text-[13px]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="flex-1">
            <div className="font-semibold">Catatan Ketentuan Penghapusan Sumber Dana</div>
            <div className="mt-0.5 text-muted">{ketentuan}</div>
          </div>
          <button className="text-xs font-semibold text-muted underline" onClick={() => setKetentuan('')}>Tutup</button>
        </div>
      )}

      <div className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Filter className="h-4 w-4 text-muted" /> Status
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['', 'Usulan', 'Disetujui', 'Ditolak'].map((s) => (
              <button
                key={s || 'all'}
                onClick={() => { setStatus(s); setPage(1); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${status === s ? 'bg-brand text-white' : 'text-muted hover:bg-brand-soft'}`}
              >
                {s || 'Semua'}
              </button>
            ))}
          </div>
          <div className="ml-auto text-[12px] text-muted">{meta.total} data</div>
        </div>

        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Trash2 className="h-8 w-8" />} title="Belum ada usulan penghapusan" hint="Klik &ldquo;Usulkan Penghapusan&rdquo; untuk membuat usulan baru." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-2.5 pr-3 font-bold">Kode Aset</th>
                  <th className="py-2.5 pr-3 font-bold">Nama</th>
                  <th className="py-2.5 pr-3 font-bold">Metode</th>
                  <th className="py-2.5 pr-3 font-bold">Tanggal</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Nilai Buku</th>
                  <th className="py-2.5 pr-3 font-bold">Status</th>
                  <th className="py-2.5 pr-3 font-bold">Alasan</th>
                  <th className="py-2.5 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="py-3 pr-3 font-mono font-semibold">{r.aset_kode}</td>
                    <td className="py-3 pr-3">{r.aset_nama || '-'}</td>
                    <td className="py-3 pr-3"><Badge text={r.metode} type="info" /></td>
                    <td className="py-3 pr-3">{formatDate(r.tanggal)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatRupiah(r.nilai_buku)}</td>
                    <td className="py-3 pr-3"><Badge text={r.status} type={statusType(r.status)} /></td>
                    <td className="max-w-[200px] truncate py-3 pr-3 text-muted" title={r.alasan || ''}>{r.alasan || '-'}</td>
                    <td className="py-3 text-right">
                      {canApprove && r.status === 'Usulan' && (
                        <Button size="sm" variant="outline" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => approve(r)}>
                          Setujui
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="h-3.5 w-3.5" />}>Prev</Button>
            <span className="text-[12px] text-muted">Hal. {meta.page} / {meta.totalPages}</span>
            <Button size="sm" variant="ghost" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Usulkan Penghapusan Aset" footer={(
        <>
          <Button variant="ghost" onClick={() => setModal(false)}>Batal</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Menyimpan...' : 'Kirim Usulan'}</Button>
        </>
      )}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Kode Aset" required error={errors.aset_kode}>
            <Input value={form.aset_kode} onChange={(e) => setForm({ ...form, aset_kode: e.target.value })} placeholder="AM-2026-0001" className="font-mono" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Metode Penghapusan" required error={errors.metode}>
              <Select value={form.metode} onChange={(e) => setForm({ ...form, metode: e.target.value as Metode })}>
                <option value="Musnah">Musnah</option>
                <option value="Lelang">Lelang</option>
                <option value="Hibah">Hibah</option>
              </Select>
            </Field>
            <Field label="Tanggal">
              <Input type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nilai Buku" error={errors.nilai_buku}>
              <Input type="number" min="0" value={form.nilai_buku} onChange={(e) => setForm({ ...form, nilai_buku: e.target.value })} placeholder="0" />
            </Field>
            {form.metode === 'Lelang' && (
              <Field label="Nilai Lelang" error={errors.nilai_lelang}>
                <Input type="number" min="0" value={form.nilai_lelang} onChange={(e) => setForm({ ...form, nilai_lelang: e.target.value })} placeholder="0" />
              </Field>
            )}
          </div>
          <Field label="Alasan">
            <Textarea value={form.alasan} onChange={(e) => setForm({ ...form, alasan: e.target.value })} placeholder="Alasan penghapusan (rusak berat, usang, dll.)" />
          </Field>
        </form>
      </Modal>
    </>
  );
}
