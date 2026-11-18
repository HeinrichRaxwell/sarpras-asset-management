import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, can, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useTheme } from '@/context/ThemeContext';
import {
  Button, Field, Input, Select, Modal, PageHeader, EmptyState, Skeleton,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  MapPin, Plus, Pencil, Trash2, FolderTree, AlertTriangle, Building2,
} from 'lucide-react';

interface Lokasi {
  id: number;
  nama: string;
  gedung: string | null;
  lantai: string | null;
  penanggung_jawab: string | null;
  parent_id: number | null;
}

interface FormState {
  nama: string;
  gedung: string;
  lantai: string;
  penanggung_jawab: string;
  parent_id: string;
}

const EMPTY: FormState = { nama: '', gedung: '', lantai: '', penanggung_jawab: '', parent_id: '' };

export default function LokasiAset() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [rows, setRows] = useState<Lokasi[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; edit: Lokasi | null }>({ open: false, edit: null });
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Lokasi | null>(null);

  const canDelete = can('delete_master');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Lokasi[]>('/lokasi');
      setRows(res.data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Build ordered tree: parents first, children indented beneath
  const ordered = useMemo(() => {
    const children = new Map<number | null, Lokasi[]>();
    for (const r of rows) {
      const k = r.parent_id ?? null;
      if (!children.has(k)) children.set(k, []);
      children.get(k)!.push(r);
    }
    const out: { row: Lokasi; depth: number }[] = [];
    const walk = (parent: number | null, depth: number) => {
      for (const r of children.get(parent) ?? []) {
        out.push({ row: r, depth });
        walk(r.id, depth + 1);
      }
    };
    walk(null, 0);
    // any orphan cycles not reachable from root
    const seen = new Set(out.map((o) => o.row.id));
    for (const r of rows) {
      if (!seen.has(r.id)) out.push({ row: r, depth: 0 });
    }
    return out;
  }, [rows]);

  const parentOptions = useMemo(
    () => rows.filter((r) => r.id !== modal.edit?.id),
    [rows, modal.edit]
  );

  const openCreate = () => {
    setForm(EMPTY);
    setErrors({});
    setModal({ open: true, edit: null });
  };

  const openEdit = (r: Lokasi) => {
    setForm({
      nama: r.nama,
      gedung: r.gedung ?? '',
      lantai: r.lantai ?? '',
      penanggung_jawab: r.penanggung_jawab ?? '',
      parent_id: r.parent_id ? String(r.parent_id) : '',
    });
    setErrors({});
    setModal({ open: true, edit: r });
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.nama.trim()) e.nama = 'Nama lokasi wajib diisi';
    if (form.parent_id && form.parent_id === String(modal.edit?.id)) e.parent_id = 'Tidak boleh menjadi induk dirinya sendiri';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      nama: form.nama.trim(),
      gedung: form.gedung.trim() || null,
      lantai: form.lantai.trim() || null,
      penanggung_jawab: form.penanggung_jawab.trim() || null,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
    };
    try {
      if (modal.edit) {
        await api.put(`/lokasi/${modal.edit.id}`, payload);
        toast('Lokasi diperbarui', 'success');
      } else {
        await api.post('/lokasi', payload);
        toast('Lokasi ditambahkan', 'success');
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
      await api.delete(`/lokasi/${confirmDel.id}`);
      toast('Lokasi dihapus', 'success');
      setConfirmDel(null);
      load();
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 409
        ? 'Tidak dapat menghapus: lokasi masih dipakai oleh aset atau memiliki sub-lokasi.'
        : (e as Error).message;
      toast(msg, 'error');
      setConfirmDel(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lokasi Aset"
        subtitle="Kelola hierarki ruang penyimpanan aset (gedung, lantai, ruang)."
        action={
          <Button icon={<Plus className="h-4 w-4" strokeWidth={1.8} />} onClick={openCreate}>
            Tambah Lokasi
          </Button>
        }
      />

      <div className="glass rounded-2xl p-5" data-theme={theme}>
        {loading ? (
          <Skeleton rows={7} />
        ) : ordered.length === 0 ? (
          <EmptyState
            icon={<FolderTree className="h-12 w-12" strokeWidth={1.8} />}
            title="Belum ada lokasi"
            hint="Tambahkan lokasi pertama untuk mulai mengelompokkan aset."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2.5 pr-4 font-semibold">Nama Lokasi</th>
                  <th className="py-2.5 pr-4 font-semibold">Gedung</th>
                  <th className="py-2.5 pr-4 font-semibold">Lantai</th>
                  <th className="py-2.5 pr-4 font-semibold">Penanggung Jawab</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map(({ row, depth }) => (
                  <tr key={row.id} className="border-b border-line/60 hover:bg-brand-soft/40">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2" style={{ paddingLeft: depth * 20 }}>
                        {depth > 0 && <span className="text-muted">└</span>}
                        <MapPin className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.8} />
                        <span className="font-medium">{row.nama}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
                        {row.gedung || '-'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">{row.lantai || '-'}</td>
                    <td className="py-2.5 pr-4">{row.penanggung_jawab || '-'}</td>
                    <td className="py-2.5 pr-4 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          className="icon-btn"
                          aria-label="Ubah"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.8} />
                        </button>
                        <button
                          className={cn('icon-btn', !canDelete && 'opacity-40 cursor-not-allowed')}
                          aria-label="Hapus"
                          disabled={!canDelete}
                          onClick={() => canDelete && setConfirmDel(row)}
                        >
                          <Trash2 className="h-4 w-4 text-danger" strokeWidth={1.8} />
                        </button>
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
        title={modal.edit ? 'Ubah Lokasi' : 'Tambah Lokasi'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal({ open: false, edit: null })}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama Lokasi" required error={errors.nama}>
            <Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Ruang Server Lantai 2" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gedung">
              <Input value={form.gedung} onChange={(e) => setForm({ ...form, gedung: e.target.value })} placeholder="Gedung A" />
            </Field>
            <Field label="Lantai">
              <Input value={form.lantai} onChange={(e) => setForm({ ...form, lantai: e.target.value })} placeholder="2" />
            </Field>
          </div>
          <Field label="Penanggung Jawab">
            <Input value={form.penanggung_jawab} onChange={(e) => setForm({ ...form, penanggung_jawab: e.target.value })} placeholder="Nama PJ" />
          </Field>
          <Field label="Lokasi Induk" error={errors.parent_id}>
            <Select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
              <option value="">— Tanpa induk (lokasi utama) —</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.nama}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Hapus Lokasi"
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
            Hapus lokasi <strong>{confirmDel?.nama}</strong>? Jika lokasi masih dipakai aset atau memiliki sub-lokasi, server akan menolak.
          </p>
        </div>
      </Modal>
    </div>
  );
}
