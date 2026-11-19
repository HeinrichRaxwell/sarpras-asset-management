import { useCallback, useEffect, useState } from 'react';
import { api, can } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useTheme } from '@/context/ThemeContext';
import {
  Button, Field, Select, Modal, PageHeader, EmptyState, Skeleton, Badge,
} from '@/components/ui';
import { formatRupiah } from '@/lib/utils';
import {
  TrendingDown, Calculator, FileSpreadsheet, X, CalendarClock,
} from 'lucide-react';

type Metode = 'Garis Lurus' | 'Saldo Menurun';

interface BarisPenyusutan {
  kode: string;
  nama: string;
  nilai_perolehan: number;
  persen_penyusutan: number;
  metode?: Metode | string;
  beban_tahunan: number;
  akumulasi: number;
  nilai_buku: number;
}

interface JadwalEntry {
  tahun: number | string;
  beban: number;
  akumulasi: number;
  nilai_buku: number;
}

const METHODS: Metode[] = ['Garis Lurus', 'Saldo Menurun'];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - 5 + i);

export default function Penyusutan() {
  const { theme } = useTheme();
  const { toast } = useToast();

  const [tahun, setTahun] = useState<number>(CURRENT_YEAR);
  const [metode, setMetode] = useState<Metode>('Garis Lurus');
  const [rows, setRows] = useState<BarisPenyusutan[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [detail, setDetail] = useState<{ open: boolean; row: BarisPenyusutan | null; jadwal: JadwalEntry[]; loading: boolean }>({
    open: false, row: null, jadwal: [], loading: false,
  });

  const canCompute = can('write');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<BarisPenyusutan[]>(`/penyusutan?tahun=${tahun}`);
      setRows(res.data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [tahun, toast]);

  useEffect(() => { load(); }, [load]);

  const compute = async () => {
    if (!canCompute) return;
    setComputing(true);
    try {
      const res = await api.post<BarisPenyusutan[]>('/penyusutan/compute', { tahun, metode });
      setRows(res.data ?? []);
      toast(`Perhitungan ${metode} tahun ${tahun} selesai`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setComputing(false);
    }
  };

  const openDetail = async (row: BarisPenyusutan) => {
    setDetail({ open: true, row, jadwal: [], loading: true });
    try {
      const res = await api.get<JadwalEntry[]>(`/penyusutan/${encodeURIComponent(row.kode)}`);
      setDetail((d) => ({ ...d, jadwal: res.data ?? [], loading: false }));
    } catch (e) {
      toast((e as Error).message, 'error');
      setDetail({ open: false, row: null, jadwal: [], loading: false });
    }
  };

  const totals = rows.reduce(
    (a, r) => ({
      nilai: a.nilai + Number(r.nilai_perolehan || 0),
      beban: a.beban + Number(r.beban_tahunan || 0),
      akumulasi: a.akumulasi + Number(r.akumulasi || 0),
      buku: a.buku + Number(r.nilai_buku || 0),
    }),
    { nilai: 0, beban: 0, akumulasi: 0, buku: 0 }
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Penyusutan Nilai"
        subtitle="Hitung dan pantau penyusutan aset aktif dengan metode Garis Lurus atau Saldo Menurun."
      />

      <div className="glass rounded-2xl p-5" data-theme={theme}>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Tahun" className="w-36">
            <Select value={tahun} onChange={(e) => setTahun(Number(e.target.value))}>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </Field>
          <Field label="Metode" className="w-52">
            <Select value={metode} onChange={(e) => setMetode(e.target.value as Metode)}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Button
            icon={<Calculator className="h-4 w-4" strokeWidth={1.8} />}
            onClick={compute}
            disabled={computing || !canCompute}
          >
            {computing ? 'Menghitung...' : 'Hitung'}
          </Button>
        </div>
      </div>

      <div className="glass rounded-2xl p-5" data-theme={theme}>
        {loading ? (
          <Skeleton rows={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<TrendingDown className="h-12 w-12" strokeWidth={1.8} />}
            title={`Belum ada data penyusutan tahun ${tahun}`}
            hint="Pilih metode lalu klik Hitung untuk menghitung penyusutan seluruh aset aktif."
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
              <Badge text={`${rows.length} aset`} type="info" />
              <Badge text={metode} type="muted" />
              <span>· Tahun anggaran {tahun}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="py-2.5 pr-4 font-semibold">Nama Aset</th>
                    <th className="py-2.5 pr-4 text-right font-semibold">Nilai Awal</th>
                    <th className="py-2.5 pr-4 text-right font-semibold">Beban Tahunan</th>
                    <th className="py-2.5 pr-4 text-right font-semibold">Akumulasi</th>
                    <th className="py-2.5 pr-4 text-right font-semibold">Nilai Buku</th>
                    <th className="py-2.5 pr-4 text-right font-semibold">Jadwal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.kode} className="border-b border-line/60 hover:bg-brand-soft/40">
                      <td className="py-2.5 pr-4">
                        <div className="flex flex-col">
                          <span className="font-medium">{r.nama}</span>
                          <code className="text-[11px] text-muted">{r.kode}</code>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatRupiah(r.nilai_perolehan)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-warning">{formatRupiah(r.beban_tahunan)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{formatRupiah(r.akumulasi)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">{formatRupiah(r.nilai_buku)}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <button
                          className="icon-btn"
                          aria-label={`Lihat jadwal ${r.nama}`}
                          onClick={() => openDetail(r)}
                        >
                          <FileSpreadsheet className="h-4 w-4 text-brand" strokeWidth={1.8} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-bold">
                    <td className="py-3 pr-4">Total</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatRupiah(totals.nilai)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatRupiah(totals.beban)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatRupiah(totals.akumulasi)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatRupiah(totals.buku)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      <Modal
        open={detail.open}
        onClose={() => setDetail({ open: false, row: null, jadwal: [], loading: false })}
        title="Jadwal Penyusutan"
        size="lg"
        footer={
          <Button variant="ghost" onClick={() => setDetail({ open: false, row: null, jadwal: [], loading: false })}>
            <X className="h-4 w-4" strokeWidth={1.8} /> Tutup
          </Button>
        }
      >
        {detail.row && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="text-[15px] font-bold">{detail.row.nama}</div>
              <code className="rounded bg-line px-1.5 py-0.5 text-[12px]">{detail.row.kode}</code>
              <Badge text={`${detail.row.persen_penyusutan}% / tahun`} type="info" />
              {detail.row.metode && <Badge text={String(detail.row.metode)} type="muted" />}
            </div>
            {detail.loading ? (
              <Skeleton rows={5} />
            ) : detail.jadwal.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-10 w-10" strokeWidth={1.8} />}
                title="Belum ada jadwal"
                hint="Jalankan perhitungan untuk aset ini terlebih dahulu."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-2.5 pr-4 font-semibold">Tahun</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Beban</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Akumulasi</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Nilai Buku</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.jadwal.map((j, i) => (
                      <tr key={i} className="border-b border-line/60">
                        <td className="py-2 pr-4 font-medium">{j.tahun}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{formatRupiah(j.beban)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted">{formatRupiah(j.akumulasi)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold">{formatRupiah(j.nilai_buku)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
