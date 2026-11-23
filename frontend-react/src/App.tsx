import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getUser } from '@/lib/api';
import { AppShell } from '@/components/AppShell';

// Lazy-load setiap halaman (code splitting per route)
const LoginPage = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const DataAset = lazy(() => import('@/pages/DataAset'));
const GudangTransit = lazy(() => import('@/pages/GudangTransit'));
const KategoriAset = lazy(() => import('@/pages/KategoriAset'));
const LokasiAset = lazy(() => import('@/pages/LokasiAset'));
const Penyusutan = lazy(() => import('@/pages/Penyusutan'));
const SumberDana = lazy(() => import('@/pages/SumberDana'));
const Peminjaman = lazy(() => import('@/pages/Peminjaman'));
const Mutasi = lazy(() => import('@/pages/Mutasi'));
const ServisKuratif = lazy(() => import('@/pages/ServisKuratif'));
const ServisPreventif = lazy(() => import('@/pages/ServisPreventif'));
const Verifikasi = lazy(() => import('@/pages/Verifikasi'));
const PetaPrasarana = lazy(() => import('@/pages/PetaPrasarana'));
const AuditTrail = lazy(() => import('@/pages/AuditTrail'));
const Penghapusan = lazy(() => import('@/pages/Penghapusan'));
const LaporanKIR = lazy(() => import('@/pages/LaporanKIR'));
const Pengguna = lazy(() => import('@/pages/Pengguna'));
const Pengaturan = lazy(() => import('@/pages/Pengaturan'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = getUser();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-3 border-brand border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><AppShell title="RAILPRAS" /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="aset" element={<DataAset />} />
          <Route path="gudang" element={<GudangTransit />} />
          <Route path="kategori" element={<KategoriAset />} />
          <Route path="lokasi" element={<LokasiAset />} />
          <Route path="penyusutan" element={<Penyusutan />} />
          <Route path="sumber-dana" element={<SumberDana />} />
          <Route path="peminjaman" element={<Peminjaman />} />
          <Route path="mutasi" element={<Mutasi />} />
          <Route path="servis-kuratif" element={<ServisKuratif />} />
          <Route path="servis-preventif" element={<ServisPreventif />} />
          <Route path="verifikasi" element={<Verifikasi />} />
          <Route path="peta-prasarana" element={<PetaPrasarana />} />
          <Route path="audit" element={<AuditTrail />} />
          <Route path="penghapusan" element={<Penghapusan />} />
          <Route path="kir" element={<LaporanKIR />} />
          <Route path="pengguna" element={<Pengguna />} />
          <Route path="pengaturan" element={<Pengaturan />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}