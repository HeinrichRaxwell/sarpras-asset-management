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

export const api = {
  get: <T = unknown>(p: string) => request<T>(p),
  post: <T = unknown>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body }),
  put: <T = unknown>(p: string, body?: unknown) => request<T>(p, { method: 'PUT', body }),
  patch: <T = unknown>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body }),
  delete: <T = unknown>(p: string) => request<T>(p, { method: 'DELETE' }),
};

// Role helper
export function can(action: 'delete_master' | 'approve' | 'read'): boolean {
  const role = getUser()?.role;
  if (role === 'admin') return true;
  if (role === 'petugas') return !['delete_master', 'approve'].includes(action);
  if (role === 'pimpinan') return ['read', 'approve'].includes(action);
  return false;
}