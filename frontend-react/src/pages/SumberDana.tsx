import { useCallback, useEffect, useState } from 'react';
import { api, can } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useTheme } from '@/context/ThemeContext';
import {
  Button, Field, Input, Textarea, Modal, PageHeader, EmptyState, Skeleton,
} from '@/components/ui';
import {
  Wallet, Plus, Pencil, Trash2, Hash, CalendarDays, AlertTriangle,
} from 'lucide-react';

interface SumberDana {
  id: number;
  nama: string;
  kode: string;
  tahun_anggaran: number | string | null;
  ketentuan_penghapusan: string | null;
}

interface FormState {
  nama: string;
  kode: string;
  tahun_anggaran: string;
  ketentuan_penghapusan: string;
}

const EMPTY: FormState = { nama: '', kode: '', tahun_anggaran: '', ketentuan_penghapusan: '' };

export default function SumberDana() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [rows, setRows] = useState<SumberDana[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; edit: SumberDana | null }>({ open: false, edit: null });
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<SumberDana | null>(null);

  const canDelete = can('delete_master');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<SumberDana[]>('/sumber-dana');
      setRows(res.data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(EMPTY);
    setErrors({});
    setModal({ open: true, edit: null });
  };

  const openEdit = (r: SumberDana) => {
    setForm({
      nama: r.nama,
      kode: r.kode,
      tahun_anggaran: r.tahun_anggaran != null ? String(r.tahun_anggaran) : '',
      ketentuan_penghapusan: r.ketentuan_penghapusan ?? '',
    });
    setErrors({});
    setModal({ open: true, edit: r });
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.nama.trim()) e.nama = 'Nama sumber dana wajib diisi';
    if (!form.kode.trim()) e.kode = 'Kode wajib diisi';
    if (form.tahun_anggaran && !/^\d{4}$/.test(form.tahun_anggaran)) e.tahun_anggaran = 'Tahun harus 4 digit (contoh: 2026)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      nama: form.nama.trim(),
      kode: form.kode.trim(),
      tahun_anggaran: form.tahun_anggaran ? Number(form.tahun_anggaran) : null,
      ketentuan_penghapusan: form.ketentuan_penghapusan.trim() || null,
    };
    try {
      if (modal.edit) {
        await api.put(`/sumber-dana/${modal.edit.id}`, payload);
        toast('Sumber dana diperbarui', 'success');
      } else {
        await api.post('/sumber-dana', payload);
        toast('Sumber dana ditambahkan', 'success');
      }
      setModal({ open: false, edit: null });
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/sumber-dana/${confirmDel.id}`);
      toast('Sumber dana dihapus', 'success');
      setConfirmDel(null);
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
      setConfirmDel(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sumber Dana"
        subtitle="Kelola daftar sumber pendanaan aset beserta ketentuan penghapusannya."
        action={can('write') && (
          <Button icon={<Plus className="h-4 w-4" strokeWidth={1.8} />} onClick={openCreate}>
            Tambah Sumber Dana
          </Button>
        )}
      />

      <div className="glass rounded-2xl p-5" data-theme={theme}>
        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-12 w-12" strokeWidth={1.8} />}
            title="Belum ada sumber dana"
            hint="Tambahkan sumber dana untuk melacak asal perolehan aset."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2.5 pr-4 font-semibold">Nama</th>
                  <th className="py-2.5 pr-4 font-semibold">Kode</th>
                  <th className="py-2.5 pr-4 font-semibold">Tahun Anggaran</th>
                  <th className="py-2.5 pr-4 font-semibold">Ketentuan Penghapusan</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 hover:bg-brand-soft/40">
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <Wallet className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.8} />
                        {r.nama}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
                        <code className="rounded bg-line px-1.5 py-0.5 text-[12px]">{r.kode}</code>
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
                        {r.tahun_anggaran ?? '-'}
                      </span>
                    </td>
                    <td className="max-w-[320px] py-2.5 pr-4 text-muted">
                      {r.ketentuan_penghapusan || '-'}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <div className="inline-flex gap-1.5">
                        {can('write') && (
                          <button className="icon-btn" aria-label="Ubah" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" strokeWidth={1.8} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="icon-btn"
                            aria-label="Hapus"
                            onClick={() => setConfirmDel(r)}
                          >
                            <Trash2 className="h-4 w-4 text-danger" strokeWidth={1.8} />
                          </button>
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

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, edit: null })}
        title={modal.edit ? 'Ubah Sumber Dana' : 'Tambah Sumber Dana'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal({ open: false, edit: null })}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama" required error={errors.nama}>
            <Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="APBD Provinsi" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kode" required error={errors.kode}>
              <Input value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} placeholder="APBD-PRV" />
            </Field>
            <Field label="Tahun Anggaran" error={errors.tahun_anggaran}>
              <Input
                type="number" inputMode="numeric"
                value={form.tahun_anggaran}
                onChange={(e) => setForm({ ...form, tahun_anggaran: e.target.value })}
                placeholder="2026" min={2000} max={2100}
              />
            </Field>
          </div>
          <Field label="Ketentuan Penghapusan">
            <Textarea
              value={form.ketentuan_penghapusan}
              onChange={(e) => setForm({ ...form, ketentuan_penghapusan: e.target.value })}
              placeholder="Ketentuan khusus terkait penghapusan aset yang didanai sumber ini..."
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Hapus Sumber Dana"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>Batal</Button>
            <Button variant="danger" onClick={doDelete}>Hapus</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-danger" strokeWidth={1.8} />
          <p className="text-[13.5px]">
            Hapus sumber dana <strong>{confirmDel?.nama}</strong> (<code>{confirmDel?.kode}</code>)?
          </p>
        </div>
      </Modal>
    </div>
  );
}
