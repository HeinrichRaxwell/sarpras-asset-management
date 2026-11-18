import { useCallback, useEffect, useState } from 'react';
import { api, can } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button, Field, Input, Select, Textarea, Modal, Badge, PageHeader, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { Repeat, Plus, CheckCircle2 } from 'lucide-react';

interface Mutasi {
  id: number;
  aset_kode: string;
  aset_nama?: string | null;
  lokasi_asal?: string | null;
  lokasi_tujuan?: string | null;
  lokasi_asal_id?: number | null;
  lokasi_tujuan_id: number;
  tanggal: string;
  alasan?: string | null;
  no_bast?: string | null;
  disetujui_oleh?: number | null;
}

interface Lokasi { id: number; nama: string }

export default function Mutasi() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Mutasi[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [approveRow, setApproveRow] = useState<Mutasi | null>(null);
  const canApprove = can('approve');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Mutasi[]>('/mutasi');
      setRows(res.data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const doApprove = async () => {
    if (!approveRow) return;
    try {
      await api.patch(`/mutasi/${approveRow.id}/approve`);
      toast('Mutasi disetujui', 'success');
      setApproveRow(null);
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mutasi Antar-Ruang"
        subtitle="Catat perpindahan aset antar ruang beserta BAST dan persetujuan pimpinan."
        action={
          can('read') ? (
            <Button icon={<Plus className="h-4 w-4" strokeWidth={1.8} />} onClick={() => setCreateOpen(true)}>
              Mutasi Baru
            </Button>
          ) : null
        }
      />

      <div className="glass rounded-2xl p-5">
        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Repeat className="h-10 w-10" strokeWidth={1.8} />}
            title="Belum ada mutasi"
            hint="Klik 'Mutasi Baru' untuk mencatat perpindahan aset antar ruang."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2.5.5 pr-3 font-semibold">Aset</th>
                  <th className="py-2.5.5 pr-3 font-semibold">Dari</th>
                  <th className="py-2.5.5 pr-3 font-semibold">Ke</th>
                  <th className="py-2.5.5 pr-3 font-semibold">Tanggal</th>
                  <th className="py-2.5.5 pr-3 font-semibold">No. BAST</th>
                  <th className="py-2.5.5 pr-3 font-semibold">Status</th>
                  <th className="py-2.5.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const approved = !!r.disetujui_oleh;
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0 transition-colors hover:bg-brand-soft/40">
                      <td className="py-3 pr-3">
                        <div className="font-semibold">{r.aset_nama || r.aset_kode}</div>
                        <div className="text-[11px] text-muted">{r.aset_kode}</div>
                      </td>
                      <td className="py-3 pr-3">{r.lokasi_asal || '-'}</td>
                      <td className="py-3 pr-3">{r.lokasi_tujuan || '-'}</td>
                      <td className="py-3 pr-3">{formatDate(r.tanggal)}</td>
                      <td className="py-3 pr-3">{r.no_bast || '-'}</td>
                      <td className="py-3 pr-3">
                        <Badge text={approved ? 'Disetujui' : 'Menunggu'} type={approved ? 'ok' : 'warn'} />
                      </td>
                      <td className="py-3 text-right">
                        {!approved && canApprove ? (
                          <Button size="sm" icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />} onClick={() => setApproveRow(r)}>
                            Setujui
                          </Button>
                        ) : (
                          <span className="text-[11.5px] text-muted">{approved ? 'Disetujui pimpinan' : 'Menunggu pimpinan'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={load} />
      <Modal
        open={!!approveRow}
        onClose={() => setApproveRow(null)}
        title="Setujui Mutasi"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setApproveRow(null)}>Batal</Button>
            <Button onClick={doApprove}>Setujui</Button>
          </>
        }
      >
        {approveRow && (
          <div className="space-y-2 text-[13px]">
            <div>Aset <strong>{approveRow.aset_nama || approveRow.aset_kode}</strong> akan dipindahkan:</div>
            <div className="text-muted">{approveRow.lokasi_asal || '—'} → {approveRow.lokasi_tujuan || '—'}</div>
            {approveRow.no_bast && <div>No. BAST: <strong>{approveRow.no_bast}</strong></div>}
            <div className="text-muted text-[12px]">Persetujuan tercatat atas nama pimpinan yang sedang login.</div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CreateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ aset_kode: '', lokasi_tujuan_id: '', tanggal: '', alasan: '', no_bast: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [asetList, setAsetList] = useState<{ kode: string; nama: string }[]>([]);
  const [lokasiList, setLokasiList] = useState<Lokasi[]>([]);
  const [asalPreview, setAsalPreview] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    api.get<{ kode: string; nama: string }[]>('/aset?limit=500')
      .then((res) => setAsetList(res.data ?? []))
      .catch(() => {});
    api.get<Lokasi[]>('/lokasi?limit=500')
      .then((res) => setLokasiList(res.data ?? []))
      .catch(() => {});
  }, [open]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onPickAset = async (kode: string) => {
    set('aset_kode', kode);
    setAsalPreview('');
    if (!kode) return;
    try {
      const res = await api.get<{ lokasi_id?: number | null; lokasi?: Lokasi | null }>(`/aset/${kode}`);
      const lok = res.data?.lokasi;
      if (lok) setAsalPreview(lok.nama);
    } catch {
      // ignore, backend auto-fills lokasi_asal from asset
    }
  };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.aset_kode) errs.aset_kode = 'Pilih aset';
    if (!form.lokasi_tujuan_id) errs.lokasi_tujuan_id = 'Pilih lokasi tujuan';
    if (form.lokasi_tujuan_id && asalPreview && lokasiList.find((l) => String(l.id) === form.lokasi_tujuan_id)?.nama === asalPreview)
      errs.lokasi_tujuan_id = 'Lokasi tujuan tidak boleh sama dengan asal';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await api.post('/mutasi', {
        aset_kode: form.aset_kode,
        lokasi_tujuan_id: Number(form.lokasi_tujuan_id),
        tanggal: form.tanggal || undefined,
        alasan: form.alasan.trim() || null,
        no_bast: form.no_bast.trim() || null,
      });
      toast('Mutasi berhasil dicatat', 'success');
      setForm({ aset_kode: '', lokasi_tujuan_id: '', tanggal: '', alasan: '', no_bast: '' });
      setAsalPreview('');
      onClose();
      onDone();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mutasi Antar-Ruang"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Aset" required error={errors.aset_kode}>
          <Select value={form.aset_kode} onChange={(e) => onPickAset(e.target.value)}>
            <option value="">— Pilih aset —</option>
            {asetList.map((a) => (
              <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
            ))}
          </Select>
        </Field>
        <Field label="Lokasi Asal (otomatis dari aset)">
          <Input value={asalPreview || '—'} disabled />
        </Field>
        <Field label="Lokasi Tujuan" required error={errors.lokasi_tujuan_id}>
          <Select value={form.lokasi_tujuan_id} onChange={(e) => set('lokasi_tujuan_id', e.target.value)}>
            <option value="">— Pilih lokasi tujuan —</option>
            {lokasiList.map((l) => (
              <option key={l.id} value={l.id}>{l.nama}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tanggal Mutasi">
          <Input type="date" value={form.tanggal} onChange={(e) => set('tanggal', e.target.value)} />
        </Field>
        <Field label="Alasan Mutasi">
          <Textarea value={form.alasan} onChange={(e) => set('alasan', e.target.value)} placeholder="Alasan perpindahan aset" />
        </Field>
        <Field label="No. BAST">
          <Input value={form.no_bast} onChange={(e) => set('no_bast', e.target.value)} placeholder="Nomor Berita Acara Serah Terima" />
        </Field>
      </div>
    </Modal>
  );
}
