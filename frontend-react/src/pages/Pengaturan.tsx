import { useEffect, useState } from 'react';
import { api, clearAuth } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { useTheme } from '@/context/ThemeContext';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, Button, Field, Input, Skeleton, Badge } from '@/components/ui';
import { UserCircle, Lock, Moon, Sun, LogOut, Monitor } from 'lucide-react';

interface Me {
  id: number; username: string; nama: string; email: string | null;
  role: 'admin' | 'petugas' | 'pimpinan'; last_login: string | null;
}

export default function Pengaturan() {
  const { toast } = useToast();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Me>('/auth/me')
      .then((res) => setMe((res as unknown as { user?: Me }).user ?? res.data ?? null))
      .catch((e) => toast((e as Error).message, 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!oldPw) e.oldPw = 'Password lama wajib diisi';
    if (newPw.length < 8) e.newPw = 'Password baru minimal 8 karakter';
    if (newPw !== confirmPw) e.confirmPw = 'Konfirmasi password tidak cocok';
    if (newPw && newPw === oldPw) e.newPw = 'Password baru harus berbeda dari yang lama';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      await api.post('/auth/change-password', { oldPassword: oldPw, newPassword: newPw });
      toast('Password berhasil diubah', 'success');
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearAuth();
    nav('/login');
  };

  return (
    <>
      <PageHeader
        title="Pengaturan"
        subtitle="Profil akun, keamanan, dan preferensi tampilan."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Profil */}
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-bold">
            <UserCircle className="h-4 w-4 text-brand" /> Profil Saya
          </div>
          {loading ? (
            <Skeleton rows={4} />
          ) : me ? (
            <div className="space-y-3 text-[13.5px]">
              <div className="flex items-center gap-4">
                <div className="avatar h-12 w-12 text-lg">{me.nama.charAt(0).toUpperCase()}</div>
                <div>
                  <div className="text-[15px] font-bold">{me.nama}</div>
                  <div className="text-muted">@{me.username}</div>
                </div>
              </div>
              <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
                <div><span className="text-muted">Peran: </span><Badge text={me.role} type="info" /></div>
                <div><span className="text-muted">Email: </span>{me.email || '-'}</div>
                <div className="sm:col-span-2"><span className="text-muted">Login terakhir: </span>{me.last_login ? formatDateTime(me.last_login) : '-'}</div>
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-muted">Tidak dapat memuat profil.</div>
          )}
        </div>

        {/* Tema */}
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-bold">
            {theme === 'dark' ? <Moon className="h-4 w-4 text-brand" /> : <Sun className="h-4 w-4 text-brand" />} Tampilan
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-[13.5px]">
              <div className="font-semibold">Mode Tema</div>
              <div className="mt-0.5 text-[12.5px] text-muted">
                Saat ini: <Badge text={theme === 'dark' ? 'Gelap' : 'Terang'} type="muted" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant={theme === 'light' ? 'primary' : 'ghost'} size="sm" icon={<Sun className="h-3.5 w-3.5" />} onClick={() => { if (theme !== 'light') toggle(); }}>
                Terang
              </Button>
              <Button variant={theme === 'dark' ? 'primary' : 'ghost'} size="sm" icon={<Moon className="h-3.5 w-3.5" />} onClick={() => { if (theme !== 'dark') toggle(); }}>
                Gelap
              </Button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-[12.5px] text-muted">
            <Monitor className="h-3.5 w-3.5" /> Preferensi tema disimpan di perangkat ini.
          </div>
        </div>

        {/* Ganti password */}
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-bold">
            <Lock className="h-4 w-4 text-brand" /> Ganti Password
          </div>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Password Lama" required error={errors.oldPw}>
              <Input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </Field>
            <Field label="Password Baru" required error={errors.newPw}>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Minimal 8 karakter" autoComplete="new-password" />
            </Field>
            <Field label="Konfirmasi Password Baru" required error={errors.confirmPw}>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Ulangi password baru" autoComplete="new-password" />
            </Field>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Ubah Password'}</Button>
          </form>
        </div>

        {/* Keluar */}
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-bold">
            <LogOut className="h-4 w-4 text-danger" /> Sesi
          </div>
          <p className="mb-4 text-[13px] text-muted">Keluar dari akun dan kembali ke halaman login.</p>
          <Button variant="danger" icon={<LogOut className="h-4 w-4" />} onClick={logout}>Keluar</Button>
        </div>
      </div>
    </>
  );
}
