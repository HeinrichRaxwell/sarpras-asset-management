import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { api, setAuth } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import LoginBackground from '@/components/LoginBackground';
import { Sun, Moon, Lock, User, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';

const FEATURES = [
  'Inventarisasi & pelacakan aset real-time',
  'Alur peminjaman, mutasi & perawatan',
  'Depresiasi otomatis & pelaporan KIR',
  'Jejak audit lengkap & kontrol akses berjenjang',
];

export default function Login() {
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const els = cardRef.current?.querySelectorAll('[data-reveal]');
    if (els?.length) {
      gsap.fromTo(
        els,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.07, ease: 'power3.out', delay: 0.15 },
      );
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!username.trim() || !password) {
      setErr('Username dan password wajib diisi');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: never }>('/auth/login', {
        username: username.trim(),
        password,
      });
      setAuth((res as { token?: string }).token ?? res.data!.token, (res as { user?: never }).user ?? res.data!.user);
      nav('/dashboard');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden p-5">
      {/* Background foto + overlay */}
      <div className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: "url('/login-bg.jpg')" }} />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-950/90 via-violet-950/85 to-slate-950/90" />
      <LoginBackground />

      {/* Tombol tema */}
      <button onClick={toggle} className="icon-btn glass absolute right-5 top-5 z-10" aria-label="Ganti tema">
        {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </button>

      <div ref={cardRef} className="grid w-full max-w-[1000px] overflow-hidden rounded-[1.75rem] shadow-2xl ring-1 ring-white/10 md:grid-cols-2">
        {/* Sisi brand + foto */}
        <div className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden p-10 text-white md:flex">
          <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url('/login-bg.jpg')" }} />
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-950/85 via-violet-950/75 to-slate-950/90" />

          <div className="flex items-center gap-3" data-reveal>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-lg font-extrabold backdrop-blur-md">
              SA
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">SARPRAS AM</div>
              <div className="text-[11.5px] opacity-70">Enterprise Asset Management</div>
            </div>
          </div>

          <div>
            <h1 className="mb-3 text-[34px] font-extrabold leading-[1.08] tracking-tight" data-reveal>
              Satu platform<br />untuk seluruh<br />aset organisasi.
            </h1>
            <p className="max-w-[380px] text-sm leading-relaxed opacity-90" data-reveal>
              Pengelolaan aset dari perolehan hingga penghapusan — terdokumentasi, terlacak, dan tervalidasi dalam satu sistem terpadu.
            </p>
            <ul className="mt-7 space-y-3 text-[13px]" data-reveal>
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2.5 opacity-90">
                  <Check className="h-4 w-4 shrink-0 text-emerald-300" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-[11px] opacity-60" data-reveal>
            <ShieldCheck className="h-3.5 w-3.5" />
            Keamanan berlapis · Sesi terenkripsi · Jejak audit penuh
          </div>
        </div>

        {/* Sisi form */}
        <div className="flex flex-col justify-center p-8 md:p-10">
          <div className="mb-1 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-brand" data-reveal>
            Portal Administrator
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight" data-reveal>Selamat datang kembali</h2>
          <p className="mb-7 mt-1.5 text-[13px] text-muted" data-reveal>
            Masukkan kredensial Anda untuk mengakses konsol pengelolaan aset.
          </p>

          {err && (
            <div className="mb-4 rounded-[10px] bg-danger/12 px-3 py-2.5 text-[12.5px] font-medium text-danger" data-reveal>{err}</div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate data-reveal>
            <Field label="Nama Pengguna" required>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9"
                  placeholder="nama pengguna"
                  autoComplete="username"
                />
              </div>
            </Field>
            <Field label="Kata Sandi" required>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-muted"
                  aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Memverifikasi…' : 'Masuk ke Sistem'}
            </Button>
          </form>

          <div className="mt-6 border-t border-line pt-4 text-[11.5px] leading-relaxed text-muted" data-reveal>
            <strong>Akun demo (lingkungan pengembangan):</strong><br />
            Administrator <code>admin / admin123</code><br />
            Petugas <code>petugas / petugas123</code> · Pimpinan <code>pimpinan / pimpinan123</code>
          </div>
        </div>
      </div>
    </div>
  );
}