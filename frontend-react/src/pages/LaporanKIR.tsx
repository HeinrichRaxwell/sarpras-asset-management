import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatRupiah, formatNumber } from '@/lib/utils';
import { PageHeader, Button, Field, Select, Input, EmptyState, Skeleton } from '@/components/ui';
import { FileText, Printer, Download, MapPin } from 'lucide-react';

interface Lokasi { id: number; nama: string; gedung?: string | null; lantai?: string | null }
interface KirItem {
  kode: string; nama: string; merk: string | null; tipe: string | null;
  tahun: number; jumlah: number; nilai: string | number;
  kondisi: string; status: string; kategori: string | null; keterangan: string | null;
}
interface KirData {
  lokasi: Lokasi;
  tahun: number;
  items: KirItem[];
  total_jumlah: number;
  total_nilai: number;
}

const currentYear = new Date().getFullYear();

export default function LaporanKIR() {
  const { toast } = useToast();
  const [lokasiList, setLokasiList] = useState<Lokasi[]>([]);
  const [lokasiId, setLokasiId] = useState('');
  const [year, setYear] = useState(String(currentYear));
  const [data, setData] = useState<KirData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Lokasi[]>('/lokasi')
      .then((res) => setLokasiList(res.data ?? []))
      .catch((e) => toast((e as Error).message, 'error'));
  }, [toast]);

  const load = useCallback(async () => {
    if (!lokasiId) return;
    const y = Number(year);
    if (!y || y < 1900 || y > currentYear + 1) { toast('Tahun tidak valid', 'error'); return; }
    setLoading(true);
    try {
      const res = await api.get<KirData>(`/kir/${lokasiId}?year=${y}`);
      setData(res.data ?? null);
    } catch (e) {
      setData(null);
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [lokasiId, year, toast]);

  const groups = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, KirItem[]>();
    for (const it of data.items) {
      const key = it.kategori || 'Tanpa Kategori';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(it);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const exportCsv = async () => {
    if (!lokasiId) return;
    try {
      const res = await fetch(`/api/kir/${lokasiId}?year=${year}&format=csv`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Gagal mengunduh CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KIR_${data?.lokasi.nama.replace(/[^\w-]+/g, '_')}_${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast('CSV berhasil diunduh', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <>
      {/* Print-only: sembunyikan sidebar/header/footer saat mencetak */}
      <style>{`@media print{aside,header,footer,.no-print{display:none!important}main{padding:0!important}.lg\\:ml-\\[264px\\]{margin-left:0!important}}`}</style>

      <PageHeader
        title="Laporan Aset (KIR)"
        subtitle="Kartu Inventaris Ruang — daftar aset per ruang berdasarkan tahun perolehan."
        action={(
          <div className="flex gap-2">
            <Button variant="outline" icon={<Printer className="h-4 w-4" strokeWidth={1.8} />} onClick={() => window.print()} disabled={!data}>Cetak</Button>
            <Button variant="outline" icon={<Download className="h-4 w-4" strokeWidth={1.8} />} onClick={exportCsv} disabled={!data}>Export CSV</Button>
          </div>
        )}
      />

      <div className="glass rounded-2xl p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Lokasi / Ruang" required>
            <Select value={lokasiId} onChange={(e) => setLokasiId(e.target.value)}>
              <option value="">— Pilih Lokasi —</option>
              {lokasiList.map((l) => (
                <option key={l.id} value={l.id}>{l.nama}{l.gedung ? ` (${l.gedung})` : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tahun Perolehan" required>
            <Input type="number" min="1900" max={currentYear + 1} value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button onClick={load} disabled={!lokasiId || loading} className="w-full">Tampilkan Laporan</Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="glass rounded-2xl p-5"><Skeleton rows={8} /></div>
      )}

      {!loading && !data && (
        <div className="glass rounded-2xl p-5">
          <EmptyState icon={<FileText className="h-8 w-8" strokeWidth={1.8} />} title="Belum ada laporan" hint="Pilih lokasi dan tahun, lalu klik &ldquo;Tampilkan Laporan&rdquo;." />
        </div>
      )}

      {!loading && data && (
        <div className="glass rounded-2xl p-5">
          <div className="mb-5 border-b border-line pb-4">
            <h3 className="text-lg font-extrabold tracking-tight">Kartu Inventaris Ruang</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" strokeWidth={1.8} /> {data.lokasi.nama}</span>
              {data.lokasi.gedung && <span>Gedung: {data.lokasi.gedung}</span>}
              {data.lokasi.lantai && <span>Lantai: {data.lokasi.lantai}</span>}
              <span>Tahun: {data.tahun}</span>
            </div>
          </div>

          {data.items.length === 0 ? (
            <EmptyState icon={<FileText className="h-8 w-8" strokeWidth={1.8} />} title="Tidak ada aset" hint={`Tidak ditemukan aset di ${data.lokasi.nama} untuk tahun ${data.tahun}.`} />
          ) : (
            <div className="space-y-6">
              {groups.map(([kategori, items]) => (
                <div key={kategori}>
                  <h4 className="mb-2 text-[13.5px] font-bold text-brand">{kategori}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                          <th className="py-2.5 pr-3 font-semibold">Kode</th>
                          <th className="py-2.5 pr-3 font-semibold">Nama Barang</th>
                          <th className="py-2.5 pr-3 font-semibold">Merk / Tipe</th>
                          <th className="py-2.5 pr-3 font-semibold text-center">Jml</th>
                          <th className="py-2.5 pr-3 font-semibold text-right">Nilai</th>
                          <th className="py-2.5 pr-3 font-semibold">Kondisi</th>
                          <th className="py-2.5 font-semibold">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.kode} className="border-b border-line/60 last:border-0 transition-colors hover:bg-brand-soft/40">
                            <td className="py-2.5 pr-3 font-mono">{it.kode}</td>
                            <td className="py-2.5 pr-3">{it.nama}</td>
                            <td className="py-2.5 pr-3 text-muted">{[it.merk, it.tipe].filter(Boolean).join(' / ') || '-'}</td>
                            <td className="py-2.5 pr-3 text-center tabular-nums">{formatNumber(it.jumlah)}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{formatRupiah(it.nilai)}</td>
                            <td className="py-2.5 pr-3">{it.kondisi}</td>
                            <td className="py-2.5 text-muted">{it.keterangan || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 border-t border-line pt-4 text-[13px]">
                <div><span className="text-muted">Total Jumlah: </span><strong className="tabular-nums">{formatNumber(data.total_jumlah)}</strong></div>
                <div><span className="text-muted">Total Nilai: </span><strong className="tabular-nums">{formatRupiah(data.total_nilai)}</strong></div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
