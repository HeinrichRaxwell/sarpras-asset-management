import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui';

interface Wilker {
  [k: string]: { stasiun: number; jembatan: number; lintas: number; petak: number; gudang: number; terowongan: number };
}
interface Stasiun { id: string; kode: string; nama: string; wilker: string; kelas: string; lat: number | null; lng: number | null; beroperasi: string; jalur: number | null; }
interface Jembatan { id: string; kode: string; nomor_bh: string; wilker: string; jenis: string; kmhm: string; panjang: number | null; lat: number | null; lng: number | null; }
interface Lintas { id: string; kode: string; nama: string; wilker: string; st_awal: string; st_akhir: string; lat_awal: number | null; lng_awal: number | null; lat_akhir: number | null; lng_akhir: number | null; }
interface Gudang { id: string; kode: string; nama: string; wilker: string; alamat: string; lat: number | null; lng: number | null; }
interface Terowongan { id: string; kode: string; nama: string; wilker: string; panjang: number | null; tahun: number | null; lat: number | null; lng: number | null; }
interface RailData {
  sumber: string;
  wilker: Wilker;
  stasiun: Stasiun[];
  jembatan: Jembatan[];
  lintas: Lintas[];
  gudang: Gudang[];
  terowongan: Terowongan[];
  petak: { wilker: string; sheet: string; petak: number; geometri: number }[];
}

type LayerKey = 'stasiun' | 'jembatan' | 'lintas' | 'gudang' | 'terowongan';
const LAYERS: { key: LayerKey; label: string; color: string }[] = [
  { key: 'stasiun', label: 'Stasiun', color: '#F5B301' },
  { key: 'jembatan', label: 'Jembatan', color: '#38BDF8' },
  { key: 'lintas', label: 'Lintas', color: '#34D399' },
  { key: 'gudang', label: 'Gudang', color: '#F87171' },
  { key: 'terowongan', label: 'Terowongan', color: '#C084FC' },
];

function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 9 });
    }
  }, [pts, map]);
  return null;
}

export default function PetaPrasarana() {
  const [data, setData] = useState<RailData | null>(null);
  const [err, setErr] = useState('');
  const [active, setActive] = useState<Record<LayerKey, boolean>>({
    stasiun: true, jembatan: false, lintas: false, gudang: false, terowongan: false,
  });
  const [wilker, setWilker] = useState('Semua');
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/rail-data.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: RailData) => setData(j))
      .catch((e) => setErr((e as Error).message));
  }, []);

  const wilkerList = useMemo(() => ['Semua', ...Object.keys(data?.wilker ?? {})], [data]);

  const norm = (s: string) => s.toLowerCase().replace(/^stasiun\s+/, '');
  const matchW = (w: string) => wilker === 'Semua' || w === wilker;
  const term = q.trim().toLowerCase();

  const ptsStasiun = useMemo(() =>
    (data?.stasiun ?? []).filter((s) => s.lat && s.lng && matchW(s.wilker) &&
      (!term || norm(s.nama).includes(term) || s.kode.toLowerCase().includes(term)))
      .map((s) => ({ lat: s.lat as number, lng: s.lng as number, title: s.nama, sub: `${s.kode} · ${s.wilker} · Kelas ${s.kelas || '-'} · ${s.jalur ?? '-'} jalur` })),
    [data, wilker, term]);

  const ptsJembatan = useMemo(() =>
    (data?.jembatan ?? []).filter((j) => j.lat && j.lng && matchW(j.wilker) &&
      (!term || j.kode.toLowerCase().includes(term) || j.nomor_bh.toLowerCase().includes(term) || String(j.panjang ?? '').includes(term)))
      .map((j) => ({ lat: j.lat as number, lng: j.lng as number, title: `Jembatan ${j.nomor_bh || j.kode}`, sub: `${j.kmhm} · ${j.panjang ?? '-'} m · ${j.wilker}` })),
    [data, wilker, term]);

  const linesLintas = useMemo(() =>
    (data?.lintas ?? []).filter((l) => l.lat_awal && l.lng_awal && l.lat_akhir && l.lng_akhir && matchW(l.wilker) &&
      (!term || l.nama.toLowerCase().includes(term) || l.kode.toLowerCase().includes(term)))
      .map((l) => ({ id: l.id, coords: [[l.lat_awal as number, l.lng_awal as number], [l.lat_akhir as number, l.lng_akhir as number]] as [number, number][], title: l.nama, sub: `${l.kode} · ${l.wilker}` })),
    [data, wilker, term]);

  const ptsGudang = useMemo(() =>
    (data?.gudang ?? []).filter((g) => g.lat && g.lng && matchW(g.wilker) &&
      (!term || g.nama.toLowerCase().includes(term) || g.kode.toLowerCase().includes(term)))
      .map((g) => ({ lat: g.lat as number, lng: g.lng as number, title: g.nama, sub: `${g.kode || '-'} · ${g.wilker}` })),
    [data, wilker, term]);

  const ptsTerowongan = useMemo(() =>
    (data?.terowongan ?? []).filter((t) => t.lat && t.lng && matchW(t.wilker) &&
      (!term || t.nama.toLowerCase().includes(term) || t.kode.toLowerCase().includes(term)))
      .map((t) => ({ lat: t.lat as number, lng: t.lng as number, title: t.nama, sub: `${t.panjang ?? '-'} m · ${t.wilker}` })),
    [data, wilker, term]);

  const totalAktif = ptsStasiun.length + ptsJembatan.length + linesLintas.length + ptsGudang.length + ptsTerowongan.length;



  const stasiunList = useMemo(() =>
    (data?.stasiun ?? []).filter((s) => matchW(s.wilker) &&
      (!term || norm(s.nama).includes(term) || s.kode.toLowerCase().includes(term)))
      .sort((a, b) => a.nama.localeCompare(b.nama)),
    [data, wilker, term]);

  return (
    <>
      <PageHeader
        title="Peta Prasarana"
        subtitle="Peta interaktif prasarana perkeretaapian Indonesia — stasiun, jembatan, lintas, gudang, dan terowongan per wilayah kereta."
      />

      {err && <div className="mb-4 rounded-[10px] bg-red-500/15 px-4 py-3 text-[13px] text-red-500">{err}</div>}
      {!data && !err && <div className="glass rounded-2xl p-6 text-[13px] text-muted">Memuat data prasarana…</div>}

      {data && (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          {/* Peta */}
          <div ref={wrapRef} className="glass overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              <MapPin className="h-4 w-4 text-[#F5B301]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.16em]">Peta Sebaran</span>
              <span className="ml-auto text-[10.5px] uppercase tracking-widest text-muted">{totalAktif} titik tampil</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
              {LAYERS.map((l) => (
                <button key={l.key} onClick={() => setActive((a) => ({ ...a, [l.key]: !a[l.key] }))}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-opacity ${active[l.key] ? 'opacity-100' : 'opacity-35'}`}
                  style={{ background: `${l.color}22`, color: l.color }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </button>
              ))}
              <select value={wilker} onChange={(e) => setWilker(e.target.value)}
                className="ml-auto rounded-[10px] border border-line bg-white/50 px-3 py-1.5 text-[12.5px] text-ink dark:bg-white/5">
                {wilkerList.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama/kode…"
                  className="w-44 rounded-[10px] border border-line bg-white/50 py-1.5 pl-9 pr-3 text-[12.5px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none dark:bg-white/5" />
              </div>
            </div>
            <div className="relative h-[520px]">
              <MapContainer center={[-6.2, 106.8]} zoom={6} scrollWheelZoom className="h-full w-full" attributionControl={false}>
                <TileLayer
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
                <FitBounds pts={[...ptsStasiun, ...ptsJembatan, ...ptsGudang, ...ptsTerowongan].slice(0, 400).map((p) => [p.lat, p.lng])} />

                {active.stasiun && ptsStasiun.slice(0, 1200).map((p, i) => (
                  <CircleMarker key={`st-${i}`} center={[p.lat, p.lng]} radius={4}
                    pathOptions={{ color: '#F5B301', fillColor: '#F5B301', fillOpacity: 0.9, weight: 1 }}>
                    <Popup><b>{p.title}</b><br />{p.sub}</Popup>
                  </CircleMarker>
                ))}
                {active.jembatan && ptsJembatan.slice(0, 1500).map((p, i) => (
                  <CircleMarker key={`jb-${i}`} center={[p.lat, p.lng]} radius={3}
                    pathOptions={{ color: '#38BDF8', fillColor: '#38BDF8', fillOpacity: 0.75, weight: 1 }}>
                    <Popup><b>{p.title}</b><br />{p.sub}</Popup>
                  </CircleMarker>
                ))}
                {active.lintas && linesLintas.map((l) => (
                  <Polyline key={`lt-${l.id}`} positions={l.coords}
                    pathOptions={{ color: '#34D399', weight: 2.5, opacity: 0.85 }}>
                    <Popup><b>{l.title}</b><br />{l.sub}</Popup>
                  </Polyline>
                ))}
                {active.gudang && ptsGudang.map((p, i) => (
                  <CircleMarker key={`gd-${i}`} center={[p.lat, p.lng]} radius={6}
                    pathOptions={{ color: '#F87171', fillColor: '#F87171', fillOpacity: 0.9, weight: 1 }}>
                    <Popup><b>{p.title}</b><br />{p.sub}</Popup>
                  </CircleMarker>
                ))}
                {active.terowongan && ptsTerowongan.map((p, i) => (
                  <CircleMarker key={`tw-${i}`} center={[p.lat, p.lng]} radius={6}
                    pathOptions={{ color: '#C084FC', fillColor: '#C084FC', fillOpacity: 0.9, weight: 1 }}>
                    <Popup><b>{p.title}</b><br />{p.sub}</Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-[10px] bg-black/60 px-3 py-2 text-[10.5px] text-white/90 backdrop-blur">
                Sumber: {data.sumber}
              </div>
            </div>
          </div>

          {/* Daftar stasiun */}
          <div className="glass flex max-h-[640px] flex-col overflow-hidden rounded-2xl">
            <div className="border-b border-line px-5 py-3">
              <span className="text-[12px] font-bold uppercase tracking-[0.16em]">Daftar Stasiun</span>
              <span className="ml-2 text-[10.5px] text-muted">{stasiunList.length} stasiun</span>
            </div>
            <div className="overflow-auto">
              {stasiunList.map((s) => (
                <button key={s.id} onClick={() => { if (s.lat && s.lng) { setActive({ stasiun: true, jembatan: false, lintas: false, gudang: false, terowongan: false }); wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }}
                  className="block w-full border-b border-line px-5 py-3 text-left transition-colors hover:bg-brand-soft/60">
                  <div className="text-[13px] font-semibold">{s.nama.replace(/^Stasiun\s+/i, '')}</div>
                  <div className="mt-0.5 text-[10.5px] text-muted">
                    {s.kode} · {s.wilker} · Kelas {s.kelas || '-'} · {s.jalur ?? '-'} jalur · {s.beroperasi === 'Ya' ? 'Beroperasi' : s.beroperasi || '-'}
                  </div>
                </button>
              ))}
              {stasiunList.length === 0 && (
                <div className="px-5 py-10 text-center text-[13px] text-muted">Tidak ada stasiun pada filter ini.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}