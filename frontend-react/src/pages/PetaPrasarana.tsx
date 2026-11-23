import { useEffect, useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui';

interface Wilker {
  [k: string]: { stasiun: number; jembatan: number; lintas: number; petak: number; gudang: number; terowongan: number };
}
interface Stasiun { id: string; kode: string; nama: string; wilker: string; kelas: string; lat: number | null; lng: number | null; beroperasi: string; jalur: number | null; }
interface Jembatan { id: string; nomor_bh: string; kode: string; wilker: string; jenis: string; kmhm: string; panjang: number | null; bentang: number | null; lintasan: number | null; tahun: number | null; }
interface Lintas { id: string; kode: string; nama: string; wilker: string; st_awal: string; st_akhir: string; }
interface RailData {
  sumber: string;
  wilker: Wilker;
  stasiun: Stasiun[];
  jembatan: Jembatan[];
  lintas: Lintas[];
  gudang: { id: string; nama: string; wilker: string; alamat: string }[];
  terowongan: { id: string; nama: string; wilker: string; panjang: number | null; tahun: number | null }[];
  petak: { wilker: string; petak: number; geometri: number }[];
}

type Tab = 'stasiun' | 'jembatan' | 'lintas' | 'petak' | 'gudang' | 'terowongan';
const TABS: { key: Tab; label: string }[] = [
  { key: 'stasiun', label: 'Stasiun' },
  { key: 'jembatan', label: 'Jembatan' },
  { key: 'lintas', label: 'Lintas' },
  { key: 'petak', label: 'Petak' },
  { key: 'gudang', label: 'Gudang' },
  { key: 'terowongan', label: 'Terowongan' },
];

export default function PetaPrasarana() {
  const [data, setData] = useState<RailData | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('stasiun');
  const [wilker, setWilker] = useState('Semua');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/rail-data.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: RailData) => setData(j))
      .catch((e) => setErr((e as Error).message));
  }, []);

  const wilkerList = useMemo(() => ['Semua', ...Object.keys(data?.wilker ?? {})], [data]);

  const filtered = useMemo(() => {
    if (!data) return [] as (Stasiun | Jembatan | Lintas | { nama: string; wilker: string })[];
    const term = q.trim().toLowerCase();
    const matchW = (w: string) => wilker === 'Semua' || w === wilker;
    const matchQ = (...fields: (string | number | null | undefined)[]) =>
      !term || fields.some((f) => String(f ?? '').toLowerCase().includes(term));
    if (tab === 'stasiun') return data.stasiun.filter((s) => matchW(s.wilker) && matchQ(s.nama, s.kode, s.kelas));
    if (tab === 'jembatan') return data.jembatan.filter((j) => matchW(j.wilker) && matchQ(j.kode, j.nomor_bh, j.jenis, j.kmhm));
    if (tab === 'lintas') return data.lintas.filter((l) => matchW(l.wilker) && matchQ(l.nama, l.kode, l.st_awal, l.st_akhir));
    if (tab === 'gudang') return data.gudang.filter((g) => matchW(g.wilker) && matchQ(g.nama, (g as { kode?: string }).kode, g.alamat));
    if (tab === 'terowongan') return data.terowongan.filter((t) => matchW(t.wilker) && matchQ(t.nama, (t as { kode?: string }).kode));
    return data.petak.filter((p) => matchW(p.wilker) && matchQ(p.petak, p.geometri, (p as { sheet?: string }).sheet));
  }, [data, tab, wilker, q]);

  return (
    <>
      <PageHeader
        title="Peta Prasarana"
        subtitle="Master prasarana perkeretaapian per wilayah kereta api — stasiun, jembatan, lintas, petak, gudang, dan terowongan."
      />

      {err && (
        <div className="mb-4 rounded-[10px] bg-red-500/15 px-4 py-3 text-[13px] text-red-500">{err}</div>
      )}

      {!data && !err && <div className="glass rounded-2xl p-6 text-[13px] text-muted">Memuat data prasarana…</div>}

      {data && (
        <>
          {/* Peta sebaran wilker (posisi kira-kira kantor BTP, bukan geometri rel) */}
          <div className="glass mb-5 overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-[#F5B301]" />
                <span className="text-[12px] font-bold uppercase tracking-[0.16em]">Sebaran Wilayah Kereta</span>
              </div>
              <span className="text-[10.5px] uppercase tracking-widest text-muted">RAILPRAS · Master Prasarana</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-line md:grid-cols-4">
              {Object.entries(data.wilker).filter(([, v]) => v.stasiun + v.jembatan + v.lintas + v.petak > 0).map(([w, v]) => (
                <button key={w} onClick={() => setWilker(wilker === w ? 'Semua' : w)}
                  className={`px-5 py-4 text-left transition-colors ${wilker === w ? 'bg-brand-soft' : 'hover:bg-brand-soft/60'}`}>
                  <div className="text-[10.5px] font-semibold uppercase tracking-widest text-muted">{w}</div>
                  <div className="mt-1 text-[15px] font-extrabold tabular-nums">{v.stasiun + v.jembatan + v.lintas + v.petak + v.gudang + v.terowongan} titik</div>
                  <div className="mt-0.5 text-[10.5px] text-muted">{v.stasiun} stasiun · {v.jembatan} jembatan · {v.lintas} lintas</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tab + filter */}
          <div className="glass mb-4 flex flex-wrap items-center gap-2 rounded-2xl p-3">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`rounded-full px-4 py-2 text-[11.5px] font-bold uppercase tracking-wider transition-colors ${tab === t.key ? 'bg-brand text-white' : 'text-muted hover:bg-brand-soft'}`}>
                {t.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <select value={wilker} onChange={(e) => setWilker(e.target.value)}
                className="rounded-[10px] border border-line bg-white/50 px-3 py-2 text-[13px] text-ink dark:bg-white/5">
                {wilkerList.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…"
                  className="w-48 rounded-[10px] border border-line bg-white/50 py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none dark:bg-white/5" />
              </div>
            </div>
          </div>

          {/* Tabel konten */}
          <div className="glass overflow-hidden rounded-2xl">
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="sticky top-0 bg-surface-2/95 backdrop-blur">
                  <tr className="text-[10.5px] uppercase tracking-widest text-muted">
                    {tab === 'stasiun' && (<><th className="px-4 py-3">Kode</th><th className="px-4 py-3">Nama Stasiun</th><th className="px-4 py-3">Wilker</th><th className="px-4 py-3">Kelas</th><th className="px-4 py-3">Jalur</th><th className="px-4 py-3">Beroperasi</th></>)}
                    {tab === 'jembatan' && (<><th className="px-4 py-3">Kode</th><th className="px-4 py-3">No. BH</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">KM/HM</th><th className="px-4 py-3">Panjang (m)</th><th className="px-4 py-3">Wilker</th></>)}
                    {tab === 'lintas' && (<><th className="px-4 py-3">Kode</th><th className="px-4 py-3">Nama Lintas</th><th className="px-4 py-3">Stasiun Awal</th><th className="px-4 py-3">Stasiun Akhir</th><th className="px-4 py-3">Wilker</th></>)}
                    {tab === 'petak' && (<><th className="px-4 py-3">Wilker</th><th className="px-4 py-3">Jumlah Petak</th><th className="px-4 py-3">Geometri Tersedia</th></>)}
                    {tab === 'gudang' && (<><th className="px-4 py-3">Kode</th><th className="px-4 py-3">Nama Gudang</th><th className="px-4 py-3">Wilker</th><th className="px-4 py-3">Alamat</th></>)}
                    {tab === 'terowongan' && (<><th className="px-4 py-3">Kode</th><th className="px-4 py-3">Nama Terowongan</th><th className="px-4 py-3">Panjang (m)</th><th className="px-4 py-3">Tahun Operasi</th><th className="px-4 py-3">Wilker</th></>)}
                  </tr>
                </thead>
                <tbody>
                  {tab === 'stasiun' && (filtered as Stasiun[]).map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">{s.kode}</td>
                      <td className="px-4 py-2.5 font-semibold">{s.nama}</td>
                      <td className="px-4 py-2.5 text-muted">{s.wilker}</td>
                      <td className="px-4 py-2.5 tabular-nums">{s.kelas || '-'}</td>
                      <td className="px-4 py-2.5 tabular-nums">{s.jalur ?? '-'}</td>
                      <td className="px-4 py-2.5">{s.beroperasi || '-'}</td>
                    </tr>
                  ))}
                  {tab === 'jembatan' && (filtered as Jembatan[]).map((j) => (
                    <tr key={j.id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">{j.kode}</td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">{j.nomor_bh || '-'}</td>
                      <td className="px-4 py-2.5 font-semibold">{j.jenis || '-'}</td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">{j.kmhm || '-'}</td>
                      <td className="px-4 py-2.5 tabular-nums">{j.panjang ?? '-'}</td>
                      <td className="px-4 py-2.5 text-muted">{j.wilker}</td>
                    </tr>
                  ))}
                  {tab === 'lintas' && (filtered as Lintas[]).map((l) => (
                    <tr key={l.id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">{l.kode}</td>
                      <td className="px-4 py-2.5 font-semibold">{l.nama}</td>
                      <td className="px-4 py-2.5 text-muted">{l.st_awal || '-'}</td>
                      <td className="px-4 py-2.5 text-muted">{l.st_akhir || '-'}</td>
                      <td className="px-4 py-2.5 text-muted">{l.wilker}</td>
                    </tr>
                  ))}
                  {tab === 'petak' && (filtered as { wilker: string; petak: number; geometri: number }[]).map((p) => (
                    <tr key={(p as { sheet?: string }).sheet ?? p.wilker} className="border-t border-line">
                      <td className="px-4 py-2.5 font-semibold">{p.wilker}</td>
                      <td className="px-4 py-2.5 tabular-nums">{p.petak}</td>
                      <td className="px-4 py-2.5 tabular-nums">{p.geometri}</td>
                    </tr>
                  ))}
                  {tab === 'gudang' && (filtered as { id: string; kode: string; nama: string; wilker: string; alamat: string }[]).map((g) => (
                    <tr key={g.id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">{g.kode || '-'}</td>
                      <td className="px-4 py-2.5 font-semibold">{g.nama}</td>
                      <td className="px-4 py-2.5 text-muted">{g.wilker}</td>
                      <td className="px-4 py-2.5 text-muted">{g.alamat || '-'}</td>
                    </tr>
                  ))}
                  {tab === 'terowongan' && (filtered as { id: string; kode: string; nama: string; panjang: number | null; tahun: number | null; wilker: string }[]).map((t) => (
                    <tr key={t.id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">{t.kode || '-'}</td>
                      <td className="px-4 py-2.5 font-semibold">{t.nama}</td>
                      <td className="px-4 py-2.5 tabular-nums">{t.panjang ?? '-'}</td>
                      <td className="px-4 py-2.5 tabular-nums">{t.tahun ?? '-'}</td>
                      <td className="px-4 py-2.5 text-muted">{t.wilker}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Tidak ada data pada filter ini.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-2.5 text-[11px] text-muted">
              {filtered.length} baris · Sumber: {data.sumber}
            </div>
          </div>
        </>
      )}
    </>
  );
}