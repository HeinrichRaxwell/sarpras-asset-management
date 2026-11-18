import { useCallback, useEffect, useState } from 'react';
import { api, can } from '@/lib/api';
import { formatRupiah, formatDate, daysBetween } from '@/lib/utils';
import { Button, Field, Input, Select, Textarea, Modal, Badge, statusType, PageHeader, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { ArrowLeftRight, Plus, Undo2, AlertTriangle, Filter } from 'lucide-react';

interface Peminjaman {
  id: number;
  aset_kode: string;
  aset_nama?: string | null;
  peminjam: string;
  unit?: string | null;
  keperluan?: string | null;
  tgl_pinjam: string;
  tgl_kembali_rencana: string;
  tgl_kembali_aktual?: string | null;
  status: 'Dipinjam' | 'Dikembalikan' | 'Terlambat';
  denda: string | number;
}

const STATUS_FILTER = ['', 'Dipinjam', 'Dikembalikan', 'Terlambat'];
const DENDA_PER_HARI = 5000;

export default function Peminjaman() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Peminjaman[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [returnRow, setReturnRow] = useState<Peminjaman | null>(null);
  const canWrite = can('read');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Peminjaman[]>(`/peminjaman${status ? `?status=${status}` : ''}`);
      setRows(res.data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [status, toast]);

  useEffect(() => { load(); }, [load]);

  const lateDays = (r: Peminjaman) =>
    r.status === 'Dipinjam' ? Math.max(0, daysBetween(new Date(), r.tgl_kembali_rencana)) : 0;

  const effectiveStatus = (r: Peminjaman) => (lateDays(r) > 0 ? 'Terlambat' : r.status);
  const lateFee = (r: Peminjaman) => lateDays(r) * DENDA_PER_HARI;

  const doReturn = async () => {
    if (!returnRow) return;
    try {
      const res = await api.patch<{ denda?: number; hari_terlambat?: number }>(`/peminjaman/${returnRow.id}/return`);
      const denda = res.data?.denda ?? 0;
      toast(
        denda > 0 ? `Dikembalikan. Denda keterlambatan ${formatRupiah(denda)}` : 'Aset dikembalikan tepat waktu',
        denda > 0 ? 'error' : 'success'
      );
      setReturnRow(null);
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Peminjaman Aset"
        subtitle="Kelola peminjaman aset, pantau keterlambatan & hitung denda."
        action={
          canWrite ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Peminjaman Baru
            </Button>
          ) : null
        }
      />

      <div className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-muted" />
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTER.map((s) => (
              <button
                key={s || 'all'}
                onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  status === s ? 'bg-brand text-white' : 'text-muted hover:bg-brand-soft'
                }`}
              >
                {s || 'Semua'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight className="h-10 w-10" />}
            title="Belum ada peminjaman"
            hint="Klik 'Peminjaman Baru' untuk mencatat peminjaman aset."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2.5 pr-3 font-semibold">Aset</th>
                  <th className="py-2.5 pr-3 font-semibold">Peminjam</th>
                  <th className="py-2.5 pr-3 font-semibold">Pinjam</th>
                  <th className="py-2.5 pr-3 font-semibold">Rencana Kembali</th>
                  <th className="py-2.5 pr-3 font-semibold">Denda</th>
                  <th className="py-2.5 pr-3 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = effectiveStatus(r);
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0">
                      <td className="py-3 pr-3">
                        <div className="font-semibold">{r.aset_nama || r.aset_kode}</div>
                        <div className="text-[11px] text-muted">{r.aset_kode}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <div>{r.peminjam}</div>
                        {r.unit && <div className="text-[11px] text-muted">{r.unit}</div>}
                      </td>
                      <td className="py-3 pr-3">{formatDate(r.tgl_pinjam)}</td>
                      <td className="py-3 pr-3">{formatDate(r.tgl_kembali_rencana)}</td>
                      <td className="py-3 pr-3">{Number(r.denda) > 0 ? formatRupiah(r.denda) : '-'}</td>
                      <td className="py-3 pr-3">
                        <Badge text={st} type={st === 'Terlambat' ? 'bad' : statusType(st)} />
                      </td>
                      <td className="py-3 text-right">
                        {r.status === 'Dipinjam' && canWrite ? (
                          <Button size="sm" variant="outline" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => setReturnRow(r)}>
                            Kembalikan
                          </Button>
                        ) : (
                          <span className="text-[11.5px] text-muted">{formatDate(r.tgl_kembali_aktual)}</span>
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
        open={!!returnRow}
        onClose={() => setReturnRow(null)}
        title="Kembalikan Aset"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReturnRow(null)}>Batal</Button>
            <Button onClick={doReturn}>Konfirmasi Pengembalian</Button>
          </>
        }
      >
        {returnRow && (
          <div className="space-y-3 text-[13px]">
            <div>Aset <strong>{returnRow.aset_nama || returnRow.aset_kode}</strong> dipinjam oleh {returnRow.peminjam}.</div>
            <div>Rencana kembali: {formatDate(returnRow.tgl_kembali_rencana)}</div>
            {lateFee(returnRow) > 0 ? (
              <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  Terlambat {lateDays(returnRow)} hari.<br />
                  Denda: <strong>{formatRupiah(lateFee(returnRow))}</strong> ({formatRupiah(DENDA_PER_HARI)}/hari)
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-success/10 p-3 text-success">Tepat waktu — tidak ada denda.</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function CreateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ aset_kode: '', peminjam: '', unit: '', keperluan: '', tgl_pinjam: '', tgl_kembali_rencana: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [asetList, setAsetList] = useState<{ kode: string; nama: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    api.get<{ kode: string; nama: string; status: string }[]>('/aset?limit=500')
      .then((res) => setAsetList((res.data ?? []).filter((a) => a.status === 'Aktif')))
      .catch(() => {});
  }, [open]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.aset_kode) errs.aset_kode = 'Pilih aset';
    if (!form.peminjam.trim()) errs.peminjam = 'Nama peminjam wajib diisi';
    if (!form.tgl_kembali_rencana) errs.tgl_kembali_rencana = 'Tanggal rencana kembali wajib diisi';
    if (form.tgl_pinjam && form.tgl_kembali_rencana && form.tgl_kembali_rencana < form.tgl_pinjam)
      errs.tgl_kembali_rencana = 'Tidak boleh sebelum tanggal pinjam';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await api.post('/peminjaman', {
        aset_kode: form.aset_kode,
        peminjam: form.peminjam.trim(),
        unit: form.unit.trim() || null,
        keperluan: form.keperluan.trim() || null,
        tgl_pinjam: form.tgl_pinjam || undefined,
        tgl_kembali_rencana: form.tgl_kembali_rencana,
      });
      toast('Peminjaman berhasil dicatat', 'success');
      setForm({ aset_kode: '', peminjam: '', unit: '', keperluan: '', tgl_pinjam: '', tgl_kembali_rencana: '' });
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
      title="Peminjaman Baru"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Aset (status Aktif)" required error={errors.aset_kode}>
          <Select value={form.aset_kode} onChange={(e) => set('aset_kode', e.target.value)}>
            <option value="">— Pilih aset —</option>
            {asetList.map((a) => (
              <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nama Peminjam" required error={errors.peminjam}>
          <Input value={form.peminjam} onChange={(e) => set('peminjam', e.target.value)} placeholder="Nama lengkap" />
        </Field>
        <Field label="Unit / Bagian">
          <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="Mis. Teknik Informatika" />
        </Field>
        <Field label="Keperluan">
          <Textarea value={form.keperluan} onChange={(e) => set('keperluan', e.target.value)} placeholder="Tujuan peminjaman" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal Pinjam">
            <Input type="date" value={form.tgl_pinjam} onChange={(e) => set('tgl_pinjam', e.target.value)} />
          </Field>
          <Field label="Rencana Kembali" required error={errors.tgl_kembali_rencana}>
            <Input type="date" value={form.tgl_kembali_rencana} onChange={(e) => set('tgl_kembali_rencana', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
