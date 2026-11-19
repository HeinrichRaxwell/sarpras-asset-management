import { useCallback, useEffect, useState } from 'react';
import { api, can } from '@/lib/api';
import { formatRupiah, formatDate } from '@/lib/utils';
import { Button, Field, Input, Select, Textarea, Modal, Badge, statusType, PageHeader, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { Wrench, Plus, Settings2 } from 'lucide-react';

interface Servis {
  id: number;
  aset_kode: string;
  aset_nama?: string | null;
  jenis: 'Kuratif' | 'Preventif';
  tanggal: string;
  masalah?: string | null;
  tindakan?: string | null;
  biaya: string | number;
  vendor?: string | null;
  status: 'Antri' | 'Proses' | 'Selesai';
}

const STATUS_OPTIONS = ['Antri', 'Proses', 'Selesai'] as const;
const KONDISI = ['Baik', 'Rusak Ringan', 'Rusak Berat'] as const;

export default function ServisKuratif() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Servis[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusRow, setStatusRow] = useState<Servis | null>(null);
  const canWrite = can('write');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Servis[]>('/servis?jenis=Kuratif');
      setRows(res.data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Servis Kuratif"
        subtitle="Perbaikan aset rusak — status aset otomatis menjadi Servis hingga selesai."
        action={
          canWrite ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Servis Kuratif Baru
            </Button>
          ) : null
        }
      />

      <div className="glass rounded-2xl p-5">
        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-10 w-10" />}
            title="Belum ada servis kuratif"
            hint="Klik 'Servis Kuratif Baru' untuk mencatat perbaikan aset rusak."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2.5 pr-3 font-semibold">Aset</th>
                  <th className="py-2.5 pr-3 font-semibold">Tanggal</th>
                  <th className="py-2.5 pr-3 font-semibold">Masalah</th>
                  <th className="py-2.5 pr-3 font-semibold">Vendor</th>
                  <th className="py-2.5 pr-3 font-semibold">Biaya</th>
                  <th className="py-2.5 pr-3 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="py-3 pr-3">
                      <div className="font-semibold">{r.aset_nama || r.aset_kode}</div>
                      <div className="text-[11px] text-muted">{r.aset_kode}</div>
                    </td>
                    <td className="py-3 pr-3">{formatDate(r.tanggal)}</td>
                    <td className="py-3 pr-3 max-w-[220px] truncate" title={r.masalah || ''}>{r.masalah || '-'}</td>
                    <td className="py-3 pr-3">{r.vendor || '-'}</td>
                    <td className="py-3 pr-3">{Number(r.biaya) > 0 ? formatRupiah(r.biaya) : '-'}</td>
                    <td className="py-3 pr-3">
                      <Badge text={r.status} type={statusType(r.status)} />
                    </td>
                    <td className="py-3 text-right">
                      {r.status !== 'Selesai' && canWrite ? (
                        <Button size="sm" variant="outline" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => setStatusRow(r)}>
                          Update Status
                        </Button>
                      ) : (
                        <span className="text-[11.5px] text-muted">{r.status === 'Selesai' ? formatDate(r.tanggal) : '-'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={load} />
      <StatusModal row={statusRow} onClose={() => setStatusRow(null)} onDone={load} />
    </div>
  );
}

function CreateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ aset_kode: '', tanggal: '', masalah: '', vendor: '', biaya: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [asetList, setAsetList] = useState<{ kode: string; nama: string; status: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    api.get<{ kode: string; nama: string; status: string }[]>('/aset?limit=500')
      .then((res) => setAsetList((res.data ?? []).filter((a) => a.status !== 'Dihapus')))
      .catch(() => {});
  }, [open]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.aset_kode) errs.aset_kode = 'Pilih aset';
    if (!form.masalah.trim()) errs.masalah = 'Deskripsi masalah wajib diisi';
    if (form.biaya && isNaN(Number(form.biaya))) errs.biaya = 'Biaya harus berupa angka';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await api.post('/servis', {
        aset_kode: form.aset_kode,
        jenis: 'Kuratif',
        tanggal: form.tanggal || undefined,
        masalah: form.masalah.trim(),
        vendor: form.vendor.trim() || null,
        biaya: form.biaya ? Number(form.biaya) : 0,
      });
      toast('Servis kuratif dicatat. Aset berstatus Servis.', 'success');
      setForm({ aset_kode: '', tanggal: '', masalah: '', vendor: '', biaya: '' });
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
      title="Servis Kuratif Baru"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Aset" required error={errors.aset_kode}>
          <Select value={form.aset_kode} onChange={(e) => set('aset_kode', e.target.value)}>
            <option value="">— Pilih aset —</option>
            {asetList.map((a) => (
              <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tanggal Servis">
          <Input type="date" value={form.tanggal} onChange={(e) => set('tanggal', e.target.value)} />
        </Field>
        <Field label="Masalah / Kerusakan" required error={errors.masalah}>
          <Textarea value={form.masalah} onChange={(e) => set('masalah', e.target.value)} placeholder="Deskripsi kerusakan aset" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vendor / Teknisi">
            <Input value={form.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="Nama vendor" />
          </Field>
          <Field label="Estimasi Biaya" error={errors.biaya}>
            <Input type="number" min="0" value={form.biaya} onChange={(e) => set('biaya', e.target.value)} placeholder="0" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function StatusModal({ row, onClose, onDone }: { row: Servis | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<'Antri' | 'Proses' | 'Selesai'>('Proses');
  const [tindakan, setTindakan] = useState('');
  const [biaya, setBiaya] = useState('');
  const [kondisi, setKondisi] = useState<(typeof KONDISI)[number]>('Baik');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setStatus(row.status === 'Antri' ? 'Proses' : 'Selesai');
      setTindakan(row.tindakan || '');
      setBiaya(String(row.biaya ?? ''));
      setKondisi('Baik');
    }
  }, [row]);

  const submit = async () => {
    if (!row) return;
    if (status === 'Selesai' && !tindakan.trim()) {
      toast('Tindakan perbaikan wajib diisi saat menyelesaikan servis', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/servis/${row.id}`, {
        status,
        tindakan: tindakan.trim() || null,
        biaya: biaya ? Number(biaya) : undefined,
        ...(status === 'Selesai' ? { kondisi_akhir: kondisi } : {}),
      });
      toast(
        status === 'Selesai' ? 'Servis selesai. Aset kembali Aktif.' : `Status diperbarui ke ${status}`,
        'success'
      );
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
      open={!!row}
      onClose={onClose}
      title="Update Status Servis"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {row && (
          <div className="text-[13px]">
            <div className="font-semibold">{row.aset_nama || row.aset_kode}</div>
            <div className="text-muted text-[12px]">{row.aset_kode} · {row.masalah || '-'}</div>
          </div>
        )}
        <Field label="Status" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tindakan Perbaikan" required={status === 'Selesai'}>
          <Textarea value={tindakan} onChange={(e) => setTindakan(e.target.value)} placeholder="Langkah perbaikan yang dilakukan" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Biaya Aktual">
            <Input type="number" min="0" value={biaya} onChange={(e) => setBiaya(e.target.value)} placeholder="0" />
          </Field>
          {status === 'Selesai' && (
            <Field label="Kondisi Akhir Aset">
              <Select value={kondisi} onChange={(e) => setKondisi(e.target.value as typeof kondisi)}>
                {KONDISI.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {status === 'Selesai' && (
          <div className="rounded-xl bg-brand-soft p-3 text-[12px] text-brand">
            Saat diselesaikan, aset otomatis kembali berstatus <strong>Aktif</strong> dengan kondisi akhir sesuai pilihan di atas.
          </div>
        )}
      </div>
    </Modal>
  );
}
