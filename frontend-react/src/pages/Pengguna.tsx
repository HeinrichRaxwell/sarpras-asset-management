import { useCallback, useEffect, useState } from 'react';
import { api, getUser, can } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, Button, Modal, Field, Input, Select, Badge, EmptyState, Skeleton } from '@/components/ui';
import { Users, Plus, Power, KeyRound, ChevronLeft, ChevronRight } from 'lucide-react';

type Role = 'admin' | 'petugas' | 'pimpinan';
interface UserRow {
  id: number; username: string; nama: string; email: string | null;
  role: Role; aktif: boolean; last_login: string | null;
}
const EMPTY = { username: '', password: '', nama: '', email: '', role: 'petugas' as Role };

export default function Pengguna() {
  const { toast } = useToast();
  const isAdmin = getUser()?.role === 'admin';
  const canManage = isAdmin && can('write');
  const meId = getUser()?.id;
  const [rows, setRows] = useState<UserRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState('');
  const [resetErr, setResetErr] = useState('');

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await api.get<UserRow[]>(`/users?page=${page}&limit=10`);
      setRows(res.data ?? []);
      if (res.meta) setMeta({ page: res.meta.page, totalPages: res.meta.totalPages, total: res.meta.total });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, toast, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(form.username.trim())) e.username = 'Username 3-50 karakter (huruf, angka, _ . -)';
    if (form.password.length < 6) e.password = 'Password minimal 6 karakter';
    if (!form.nama.trim()) e.nama = 'Nama wajib diisi';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email tidak valid';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        username: form.username.trim(), password: form.password,
        nama: form.nama.trim(), role: form.role,
      };
      if (form.email.trim()) body.email = form.email.trim();
      await api.post('/users', body);
      toast('Pengguna dibuat', 'success');
      setCreateOpen(false);
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

  const toggle = async (u: UserRow) => {
    try {
      await api.patch(`/users/${u.id}/toggle`);
      toast(`Pengguna ${u.username} ${u.aktif ? 'dinonaktifkan' : 'diaktifkan'}`, 'success');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const doReset = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!resetFor) return;
    if (newPw.length < 6) { setResetErr('Password minimal 6 karakter'); return; }
    setResetErr('');
    try {
      await api.patch(`/users/${resetFor.id}/reset-password`, { password: newPw });
      toast(`Password ${resetFor.username} direset`, 'success');
      setResetFor(null);
      setNewPw('');
    } catch (e) {
      setResetErr((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Pengguna & Peran"
        subtitle="Kelola akun pengguna sistem dan peran (admin, petugas, pimpinan)."
        action={canManage ? (
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setForm(EMPTY); setErrors({}); setCreateOpen(true); }}>
            Tambah Pengguna
          </Button>
        ) : undefined}
      />

      <div className="glass rounded-2xl p-5">
        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users className="h-8 w-8" />} title="Tidak ada pengguna" hint={isAdmin ? 'Klik "Tambah Pengguna" untuk membuat akun baru.' : 'Hanya admin yang dapat melihat daftar pengguna.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-2.5 pr-3 font-bold">Username</th>
                  <th className="py-2.5 pr-3 font-bold">Nama</th>
                  <th className="py-2.5 pr-3 font-bold">Email</th>
                  <th className="py-2.5 pr-3 font-bold">Peran</th>
                  <th className="py-2.5 pr-3 font-bold">Status</th>
                  <th className="py-2.5 pr-3 font-bold">Login Terakhir</th>
                  <th className="py-2.5 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-line/60 last:border-0">
                    <td className="py-3 pr-3 font-mono font-semibold">{u.username}</td>
                    <td className="py-3 pr-3">{u.nama}</td>
                    <td className="py-3 pr-3 text-muted">{u.email || '-'}</td>
                    <td className="py-3 pr-3"><Badge text={u.role} type="info" /></td>
                    <td className="py-3 pr-3"><Badge text={u.aktif ? 'Aktif' : 'Nonaktif'} type={u.aktif ? 'ok' : 'muted'} /></td>
                    <td className="py-3 pr-3 text-muted">{u.last_login ? formatDateTime(u.last_login) : 'Belum pernah'}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        {canManage && (
                          <>
                            <Button
                              size="sm" variant="ghost" icon={<KeyRound className="h-3.5 w-3.5" />}
                              onClick={() => { setResetFor(u); setNewPw(''); setResetErr(''); }}
                            >
                              Reset
                            </Button>
                            <Button
                              size="sm" variant={u.aktif ? 'danger' : 'outline'}
                              icon={<Power className="h-3.5 w-3.5" />}
                              disabled={u.id === meId}
                              onClick={() => toggle(u)}
                            >
                              {u.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isAdmin && meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="h-3.5 w-3.5" />}>Prev</Button>
            <span className="text-[12px] text-muted">Hal. {meta.page} / {meta.totalPages}</span>
            <Button size="sm" variant="ghost" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>

      {/* Create user modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tambah Pengguna" footer={(
        <>
          <Button variant="ghost" onClick={() => setCreateOpen(false)}>Batal</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Menyimpan...' : 'Buat Pengguna'}</Button>
        </>
      )}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username" required error={errors.username}>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="username" className="font-mono" />
            </Field>
            <Field label="Nama Lengkap" required error={errors.nama}>
              <Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Nama pengguna" />
            </Field>
          </div>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@domain.com" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" required error={errors.password}>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" />
            </Field>
            <Field label="Peran" required>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="petugas">Petugas</option>
                <option value="pimpinan">Pimpinan</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
          </div>
        </form>
      </Modal>

      {/* Reset password modal */}
      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title={`Reset Password — ${resetFor?.username ?? ''}`} size="sm" footer={(
        <>
          <Button variant="ghost" onClick={() => setResetFor(null)}>Batal</Button>
          <Button onClick={doReset}>Reset Password</Button>
        </>
      )}>
        <form onSubmit={doReset} className="space-y-4" noValidate>
          <Field label="Password Baru" required error={resetErr}>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="••••••" autoFocus />
          </Field>
        </form>
      </Modal>
    </>
  );
}
