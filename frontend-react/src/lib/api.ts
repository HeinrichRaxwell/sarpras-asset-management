const BASE = (import.meta.env.VITE_API_BASE ?? '/api') + '';

export type ApiResult<T = unknown> = {
  ok: boolean;
  data?: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
  error?: string;
};

const TOKEN_KEY = 'sarpras_token';
const USER_KEY = 'sarpras_user';

export interface User {
  id: number;
  username: string;
  nama: string;
  email?: string;
  role: 'admin' | 'petugas' | 'pimpinan';
  read_only?: boolean;
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}
export function getUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
  } catch {
    return null;
  }
}
export function setAuth(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('Tidak dapat menghubungi server', 0);
  }

  let json: ApiResult<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('Respons server tidak valid', res.status);
  }

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new ApiError('Sesi berakhir, silakan login kembali', 401);
  }
  if (!res.ok || json.ok === false) {
    throw new ApiError(json.error || `Terjadi kesalahan (${res.status})`, res.status);
  }
  return json;
}

// Akun pratinjau: semua aksi tulis ditolak di klien maupun server.
export function isReadOnly(): boolean {
  return !!getUser()?.read_only;
}

// Label status gaya operasional perkeretaapian.
// Nilai yang dikirim ke API tetap istilah asli agar data aman.
export const STATUS_LABEL: Record<string, string> = {
  Aktif: 'Beroperasi',
  Dipinjam: 'Di Operasikan Pihak Lain',
  Servis: 'Di Depo Perawatan',
  Mutasi: 'Alih Jalur',
  Dihapus: 'Nonaktif / Afkir',
};

export function statusLabel(s?: string | null): string {
  if (!s) return '';
  return STATUS_LABEL[s] ?? s;
}

const READ_ONLY_MSG = 'Akun pratinjau hanya dapat melihat data. Perubahan tidak diizinkan.';

function guardWrite() {
  if (isReadOnly()) throw new ApiError(READ_ONLY_MSG, 403);
}

export const api = {
  get: <T = unknown>(p: string) => request<T>(p),
  post: <T = unknown>(p: string, body?: unknown) => { guardWrite(); return request<T>(p, { method: 'POST', body }); },
  put: <T = unknown>(p: string, body?: unknown) => { guardWrite(); return request<T>(p, { method: 'PUT', body }); },
  patch: <T = unknown>(p: string, body?: unknown) => { guardWrite(); return request<T>(p, { method: 'PATCH', body }); },
  delete: <T = unknown>(p: string) => { guardWrite(); return request<T>(p, { method: 'DELETE' }); },
};

// Role helper. 'read' = boleh melihat; 'write' = boleh menambah/mengubah.
export function can(action: 'delete_master' | 'approve' | 'read' | 'write'): boolean {
  const u = getUser();
  if (u?.read_only) return action === 'read';
  const role = u?.role;
  if (role === 'admin') return true;
  if (role === 'petugas') return !['delete_master', 'approve'].includes(action);
  if (role === 'pimpinan') return ['read', 'approve'].includes(action);
  return false;
}