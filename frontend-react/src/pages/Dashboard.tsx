import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { api, can } from '@/lib/api';
import { formatNumber, formatRupiah, formatDate } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { PageHeader, EmptyState, Skeleton, Badge, statusType, Button } from '@/components/ui';
import {
  Package, Wallet, ArrowLeftRight, Wrench, AlertTriangle,
  Clock, FileText,
} from 'lucide-react';

interface Totals {
  total_aset: number;
  total_nilai_perolehan: number;
  jumlah_dipinjam: number;
  jumlah_servis: number;
  jumlah_rusak: number;
  total_nilai_buku_sekarang: number;
}
interface DashboardData {
  totals: Totals;
  breakdown_by_kategori: { id: number; nama: string; jumlah: number; nilai: string }[];
  breakdown_by_lokasi_top10: { id: number; nama: string; gedung: string; jumlah: number; nilai: string }[];
  tren_peminjaman: { bulan: string; jumlah: number }[];
  alerts: {
    penghapusan_menunggu_persetujuan: number;
    peminjaman_terlambat: number;
    servis_preventif_jatuh_tempo_7hari: number;
  };
  recent_asset_log: {
    id: number;
    kode_aset: string;
    nama_aset: string;
    aksi: string;
    deskripsi?: string;
    petugas?: string;
    created_at: string;
  }[];
}

const ALERT_META = [
  { key: 'penghapusan_menunggu_persetujuan' as const, label: 'Penghapusan menunggu persetujuan', icon: AlertTriangle, tone: 'text-warning', href: '#/penghapusan' },
  { key: 'peminjaman_terlambat' as const, label: 'Peminjaman terlambat dikembalikan', icon: Clock, tone: 'text-danger', href: '#/peminjaman' },
  { key: 'servis_preventif_jatuh_tempo_7hari' as const, label: 'Servis preventif jatuh tempo ≤ 7 hari', icon: Wrench, tone: 'text-brand', href: '#/servis-preventif' },
];

export default function Dashboard() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const [d, setD] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const catRef = useRef<HTMLCanvasElement>(null);
  const lokRef = useRef<HTMLCanvasElement>(null);
  const trenRef = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Chart[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<DashboardData>('/dashboard');
      setD(res.data ?? null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  // Charts
  useEffect(() => {
    if (!d) return;
    charts.current.forEach((c) => c.destroy());
    charts.current = [];
    const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const tickColor = theme === 'dark' ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.6)';
    const palette = ['#0A1B2E', '#F5B301', '#1F4E79', '#2E86AB', '#E4572E', '#0E7C7B', '#7A7A7A', '#B8860B', '#41698C', '#8C6D31'];

    const mk = (ref: HTMLCanvasElement | null, cfg: any) => {
      if (!ref) return;
      charts.current.push(new Chart(ref, cfg) as any);
    };

    mk(catRef.current, {
      type: 'doughnut',
      data: {
        labels: d.breakdown_by_kategori.map((x) => x.nama),
        datasets: [{ data: d.breakdown_by_kategori.map((x) => x.jumlah), backgroundColor: palette, borderWidth: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: tickColor, boxWidth: 12, font: { size: 11 } } } },
      },
    });

    mk(lokRef.current, {
      type: 'bar',
      data: {
        labels: d.breakdown_by_lokasi_top10.map((x) => x.nama),
        datasets: [{ label: 'Jumlah Aset', data: d.breakdown_by_lokasi_top10.map((x) => x.jumlah), backgroundColor: palette[0] + 'cc', borderRadius: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
        },
      },
    });

    mk(trenRef.current, {
      type: 'line',
      data: {
        labels: d.tren_peminjaman.map((x) => x.bulan),
        datasets: [{
          label: 'Peminjaman', data: d.tren_peminjaman.map((x) => x.jumlah),
          borderColor: palette[1], backgroundColor: palette[1] + '33',
          fill: true, tension: 0.35, pointRadius: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });

    return () => { charts.current.forEach((c) => c.destroy()); charts.current = []; };
  }, [d, theme]);

  const kpis = [
    { label: 'Total Aset', value: formatNumber(d?.totals.total_aset ?? 0), icon: Package, tone: 'bg-brand/15 text-brand', sub: 'Armada aset terdaftar' },
    { label: 'Nilai Perolehan', value: formatRupiah(d?.totals.total_nilai_perolehan ?? 0), icon: Wallet, tone: 'bg-success/15 text-success', sub: 'Nilai perolehan keseluruhan' },
    { label: 'Di Operasikan Pihak Lain', value: formatNumber(d?.totals.jumlah_dipinjam ?? 0), icon: ArrowLeftRight, tone: 'bg-warning/15 text-warning', sub: 'Status peminjaman aktif' },
    { label: 'Di Depo Perawatan', value: formatNumber(d?.totals.jumlah_servis ?? 0), icon: Wrench, tone: 'bg-danger/15 text-danger', sub: 'Sedang melalui work order' },
  ];

  const activeAlerts = d ? ALERT_META.filter((a) => (d.alerts?.[a.key] ?? 0) > 0) : [];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Ringkasan kondisi aset organisasi secara real-time." />

      {d && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-line bg-[#0A1B2E] text-white">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#F5B301]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.18em]">Status Armada Aset</span>
            </div>
            <span className="text-[10.5px] uppercase tracking-widest text-white/50">RAILPRAS · Papan Operasional</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-white/10 md:grid-cols-4">
            {[
              { l: 'Beroperasi', v: (d.totals.total_aset ?? 0) - (d.totals.jumlah_dipinjam ?? 0) - (d.totals.jumlah_servis ?? 0), c: 'text-emerald-300' },
              { l: 'Di Operasikan Pihak Lain', v: d.totals.jumlah_dipinjam ?? 0, c: 'text-[#F5B301]' },
              { l: 'Di Depo Perawatan', v: d.totals.jumlah_servis ?? 0, c: 'text-orange-300' },
              { l: 'Kondisi Perlu Tindakan', v: d.totals.jumlah_rusak ?? 0, c: 'text-red-300' },
            ].map((x) => (
              <div key={x.l} className="px-5 py-4">
                <div className="text-[10.5px] font-semibold uppercase tracking-widest text-white/55">{x.l}</div>
                <div className={`mt-1 text-2xl font-extrabold tabular-nums ${x.c}`}>{formatNumber(x.v)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5"><Skeleton rows={3} /></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="glass rounded-2xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">{k.label}</div>
                  <div className="mt-1.5 text-[22px] font-extrabold tracking-tight">{k.value}</div>
                  <div className="mt-1 text-[11px] text-muted">{k.sub}</div>
                </div>
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${k.tone}`}>
                  <k.icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeAlerts.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-[14px] font-bold">
            <AlertTriangle className="h-4 w-4 text-warning" strokeWidth={1.8} />
            Perlu Perhatian
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {activeAlerts.map((a) => (
              <a key={a.key} href={a.href} className="flex items-center gap-3 rounded-xl border border-line bg-brand-soft/30 p-3.5 transition hover:bg-brand-soft/60">
                <a.icon className={`h-5 w-5 shrink-0 ${a.tone}`} strokeWidth={1.8} />
                <div className="min-w-0">
                  <div className="text-lg font-extrabold leading-none">{d?.alerts?.[a.key] ?? 0}</div>
                  <div className="mt-0.5 truncate text-[12px] text-muted">{a.label}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-[15px] font-bold">Aset per Kategori</h3>
          <div className="h-[280px]"><canvas ref={catRef} /></div>
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-[15px] font-bold">Top 10 Lokasi Aset</h3>
          <div className="h-[280px]"><canvas ref={lokRef} /></div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="mb-3 text-[15px] font-bold">Tren Peminjaman</h3>
        <div className="h-[240px]"><canvas ref={trenRef} /></div>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-bold">Aktivitas Aset Terbaru</h3>
          <span className="text-[11.5px] text-muted">{formatDate(new Date())}</span>
        </div>
        {!d?.recent_asset_log?.length ? (
          <EmptyState icon={<FileText className="h-8 w-8" strokeWidth={1.8} />} title="Belum ada aktivitas" hint="Log akan muncul saat ada perubahan data aset." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-3 font-bold">Kode</th>
                  <th className="pb-2 pr-3 font-bold">Nama Aset</th>
                  <th className="pb-2 pr-3 font-bold">Aksi</th>
                  <th className="pb-2 pr-3 font-bold">Keterangan</th>
                  <th className="pb-2 pr-3 font-bold">Petugas</th>
                  <th className="pb-2 font-bold">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {d.recent_asset_log.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-2.5 pr-3 font-mono text-[12px]">{r.kode_aset}</td>
                    <td className="py-2.5 pr-3">{r.nama_aset}</td>
                    <td className="py-2.5 pr-3"><Badge text={r.aksi} type={statusType(r.aksi)} /></td>
                    <td className="py-2.5 pr-3 text-muted">{r.deskripsi ?? '-'}</td>
                    <td className="py-2.5 pr-3 text-muted">{r.petugas ?? '-'}</td>
                    <td className="py-2.5 text-muted">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {can('delete_master') && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { void load(); }}>Muat ulang</Button>
          </div>
        )}
      </div>
    </>
  );
}
