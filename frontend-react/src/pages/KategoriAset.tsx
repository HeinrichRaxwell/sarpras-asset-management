import { useEffect, useState } from 'react';
import { api, can } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { Button, Field, Input, Textarea, Modal, PageHeader, EmptyState, Skeleton } from '@/components/ui';
import { Tags, Plus, Pencil, Trash2 } from 'lucide-react';

interface Kategori {
  id: number;
  nama: string;
  deskripsi?: string | null;
  umur_ekonomis_tahun?: number | string | null;
  persen_penyusutan?: number | string | null;
  akun_penyusutan?: string | null;
}

const EMPTY: Partial<Kategori> = { nama: '', umur_ekonomis_tahun: 5, persen_penyusutan: 20 };

export default function KategoriAset() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Kategori[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Kategori> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Kategori | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<Kategori[]>('/kategori?limit=1000');
      setRows(res.data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form?.nama?.trim()) e.nama = 'Nama kategori wajib diisi';
    const umur = Number(form?.umur_ekonomis_tahun);
    if (form?.umur_ekonomis_tahun !== '' && form?.umur_ekonomis_tahun != null && (isNaN(umur) || umur < 0)) e.umur_ekonomis_tahun = 'Umur ekonomis harus angka ≥ 0';
    const persen = Number(form?.persen_penyusutan);
    if (form?.persen_penyusutan !== '' && form?.persen_penyusutan != null && (isNaN(persen) || persen < 0 || persen > 100)) e.persen_penyusutan = 'Persentase harus di antara 0–100';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        nama: form?.nama?.trim(),
        deskripsi: form?.deskripsi || null,
        umur_ekonomis_tahun: form?.umur_ekonomis_tahun === '' || form?.umur_ekonomis_tahun == null ? null : Number(form.umur_ekonomis_tahun),
        persen_penyusutan: form?.persen_penyusutan === '' || form?.persen_penyusutan == null ? null : Number(form.persen_penyusutan),
        akun_penyusutan: form?.akun_penyusutan || null,
      };
      if (editingId) await api.put(`/kategori/${editingId}`, payload);
      else await api.post('/kategori', payload);
      toast(editingId ? 'Kategori diperbarui' : 'Kategori ditambahkan', 'success');
      setForm(null); setEditingId(null);
      void load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/kategori/${confirmDel.id}`);
      toast('Kategori dihapus', 'success');
      setConfirmDel(null);
      void load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const canWrite = can('read');

  return (
    <>
      <PageHeader
        title="Kategori Aset"
        subtitle="Kelompok klasifikasi aset beserta aturan penyusutannya."
        action={canWrite && (
          <Button icon={<Plus className="h-4 w-4" strokeWidth={1.8} />} onClick={() => { setForm({ ...EMPTY }); setEditingId(null); setErrors({}); }}>
            Tambah Kategori
          </Button>
        )}
      />

      <div className="glass rounded-2xl p-5">
        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Tags className="h-9 w-9" strokeWidth={1.8} />} title="Belum ada kategori" hint="Tambahkan kategori untuk mengklasifikasikan aset." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((k) => (
              <div key={k.id} className="group rounded-xl border border-line bg-brand-soft/20 p-4 transition hover:bg-brand-soft/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Tags className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.8} />
                      <h4 className="truncate text-[14px] font-bold">{k.nama}</h4>
                    </div>
                    {k.deskripsi && <p className="mt-1 line-clamp-2 text-[12px] text-muted">{k.deskripsi}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => { setForm({ ...k }); setEditingId(k.id); setErrors({}); }} className="icon-btn h-7 w-7" aria-label="Edit" title="Edit">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </button>
                    <button onClick={() => setConfirmDel(k)} className="icon-btn h-7 w-7 text-danger hover:bg-danger/10" aria-label="Hapus" title="Hapus" disabled={!can('delete_master')}>
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[11.5px]">
                  <div>
                    <div className="text-muted">Umur Ekonomis</div>
                    <div className="font-bold">{k.umur_ekonomis_tahun != null ? `${k.umur_ekonomis_tahun} thn` : '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted">Penyusutan</div>
                    <div className="font-bold">{k.persen_penyusutan != null ? `${Number(k.persen_penyusutan)}%` : '-'}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted">Akun</div>
                    <div className="truncate font-bold">{k.akun_penyusutan || '-'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!form}
        onClose={() => { setForm(null); setEditingId(null); }}
        title={editingId ? 'Edit Kategori' : 'Tambah Kategori'}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setForm(null); setEditingId(null); }}>Batal</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama Kategori" required error={errors.nama}>
            <Input value={form?.nama ?? ''} onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))} placeholder="Contoh: Peralatan Komputer" />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Umur Ekonomis (tahun)" error={errors.umur_ekonomis_tahun}>
              <Input type="number" min="0" step="1" value={form?.umur_ekonomis_tahun ?? ''} onChange={(e) => setForm((f) => ({ ...f, umur_ekonomis_tahun: e.target.value === '' ? '' : Number(e.target.value) }))} />
            </Field>
            <Field label="Persen Penyusutan (%)" error={errors.persen_penyusutan}>
              <Input type="number" min="0" max="100" step="0.01" value={form?.persen_penyusutan ?? ''} onChange={(e) => setForm((f) => ({ ...f, persen_penyusutan: e.target.value === '' ? '' : Number(e.target.value) }))} />
            </Field>
          </div>
          <Field label="Akun Penyusutan">
            <Input value={form?.akun_penyusutan ?? ''} onChange={(e) => setForm((f) => ({ ...f, akun_penyusutan: e.target.value }))} placeholder="Contoh: 1.2.3.05.00 - Beban Penyusutan Peralatan" />
          </Field>
          <Field label="Deskripsi">
            <Textarea value={form?.deskripsi ?? ''} onChange={(e) => setForm((f) => ({ ...f, deskripsi: e.target.value }))} placeholder="Penjelasan singkat kategori..." />
          </Field>
        </div>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Hapus Kategori" size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>Batal</Button>
            <Button variant="danger" onClick={() => void doDelete()}>Hapus</Button>
          </>
        }
      >
        <p className="text-[13px]">Yakin hapus kategori <strong>{confirmDel?.nama}</strong>? Kategori yang masih dipakai aset mungkin ditolak sistem.</p>
      </Modal>
    </>
  );
}
