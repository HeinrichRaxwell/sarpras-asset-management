import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAuth, getToken } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon, Lock, User } from 'lucide-react';
import SchoolIllustration from '@/components/SchoolIllustration';

export default function Login() {
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (getToken()) {
    nav('/dashboard');
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!username.trim() || !password) {
      setErr('Username dan password wajib diisi');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: any }>('/auth/login', {
        username: username.trim(), password,
      });
      // Backend mengembalikan token & user di root (bukan di dalam data)
      setAuth((res as any).token ?? res.data!.token, (res as any).user ?? res.data!.user);
      nav('/dashboard');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-5">
      <button
        onClick={toggle}
        className="icon-btn absolute right-5 top-5"
        aria-label="Ganti tema"
      >
        {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </button>

      <div className="glass grid w-full max-w-[940px] overflow-hidden rounded-[1.25rem] md:grid-cols-2">
        {/* Brand side */}
        <div className="relative hidden min-h-[560px] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand to-violet-500 text-white md:flex">
          <div className="absolute inset-0 z-0">
            <SchoolIllustration />
          </div>
          <div className="relative z-10 flex flex-col justify-between p-10">
            <div className="grid h-13 w-13 place-items-center rounded-2xl bg-white/20 text-xl font-extrabold backdrop-blur">
              SA
            </div>
            <div>
              <h1 className="mb-2 text-[30px] font-extrabold leading-[1.1] tracking-tight drop-shadow">SARPRAS AM</h1>
              <p className="text-sm leading-relaxed opacity-95">
                Sistem Manajemen Sarana dan Prasarana. Kelola aset organisasi dari perolehan hingga penghapusan dalam satu platform terpadu.
              </p>
            </div>
          </div>
        </div>

        {/* Form side */}
        <div className="flex flex-col justify-center p-8 md:p-10">
          <h2 className="text-2xl font-extrabold tracking-tight">Masuk</h2>
          <p className="mb-7 mt-1.5 text-[13.5px] text-muted">Gunakan akun terdaftar untuk mengakses panel admin.</p>

          {err && (
            <div className="mb-4 rounded-[10px] bg-danger/12 px-3 py-2.5 text-[12.5px] font-medium text-danger">{err}</div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Username" required>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  id="username" value={username} onChange={(e) => setUsername(e.target.value)}
                  className="pl-9" placeholder="username" autoComplete="username"
                />
              </div>
            </Field>
            <Field label="Password" required>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  id="password" type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-9"
                  placeholder="••••••••" autoComplete="current-password"
                />
                <button
                  type="button" onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-muted"
                  aria-label="Tampilkan password"
                >
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Memproses...' : 'Masuk'}
            </Button>
          </form>

          <div className="mt-6 border-t border-line pt-4 text-[11.5px] leading-relaxed text-muted">
            <strong>Akun default (development):</strong><br />
            Admin <code>admin / admin123</code> · Petugas <code>petugas / petugas123</code><br />
            Pimpinan <code>pimpinan / pimpinan123</code>
          </div>
        </div>
      </div>
    </div>
  );
}