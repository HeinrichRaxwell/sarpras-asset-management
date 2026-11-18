import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

/* ---------------- Button ---------------- */
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'outline';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-brand text-white hover:brightness-110 shadow-sm',
  ghost: 'bg-transparent text-ink border border-line hover:bg-brand-soft',
  danger: 'bg-danger text-white hover:brightness-110',
  outline: 'bg-transparent text-brand border border-brand/40 hover:bg-brand-soft',
};
const btnSizes = { sm: 'px-2.5 py-1.5 text-xs rounded-lg', md: 'px-4 py-2 text-[13px] rounded-[10px]', lg: 'px-5 py-2.5 text-sm rounded-xl' };

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn('inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed', btnVariants[variant], btnSizes[size], className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------------- Form fields ---------------- */
export function Field({ label, error, required, children, className }: { label: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-xs font-semibold text-muted">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error && <div className="text-[11.5px] text-danger">{error}</div>}
    </div>
  );
}

const inputCls = 'w-full rounded-[10px] border border-line bg-white/50 px-3 py-2 text-[13px] text-ink transition-all placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand-soft dark:bg-white/5';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, className)} {...props} />;
}
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputCls, className)} {...props}>{children}</select>;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, 'min-h-20 resize-y', className)} {...props} />;
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;
  const maxW = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={cn('glass max-h-[90vh] w-full overflow-y-auto rounded-[1.25rem] p-6', maxW)} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-[17px] font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} className="icon-btn" aria-label="Tutup">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2.5">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Badge ---------------- */
const badgeMap: Record<string, string> = {
  ok: 'bg-success/15 text-success', info: 'bg-brand-soft text-brand',
  warn: 'bg-warning/15 text-warning', bad: 'bg-danger/15 text-danger',
  muted: 'bg-line text-muted',
};
export function Badge({ text, type = 'muted' }: { text: string; type?: keyof typeof badgeMap }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold', badgeMap[type])}>{text}</span>;
}

export function statusType(s: string): keyof typeof badgeMap {
  const m: Record<string, keyof typeof badgeMap> = {
    'Aktif': 'ok', 'Baik': 'ok', 'Dikembalikan': 'ok', 'Selesai': 'ok', 'Lolos': 'ok',
    'Dipinjam': 'info', 'Proses': 'info', 'Mutasi': 'info', 'Menunggu': 'warn',
    'Antri': 'warn', 'Servis': 'warn', 'Rusak Ringan': 'warn',
    'Terlambat': 'bad', 'Rusak Berat': 'bad', 'Dihapus': 'bad', 'Ditolak': 'bad',
  };
  return m[s] ?? 'muted';
}

/* ---------------- Page header ---------------- */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="empty flex flex-col items-center gap-2 py-12 text-center text-muted">
      {icon && <div className="opacity-50">{icon}</div>}
      <div className="text-[14px] font-semibold text-ink">{title}</div>
      {hint && <div className="text-[12.5px]">{hint}</div>}
    </div>
  );
}

/* ---------------- Skeleton ---------------- */
export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-line" style={{ width: `${90 - i * 8}%` }} />
      ))}
    </div>
  );
}