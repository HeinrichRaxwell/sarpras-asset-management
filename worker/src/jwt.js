// JWT HS256 via WebCrypto — jsonwebtoken bergantung pada Node crypto yang
// tidak tersedia penuh di Workers. Format token tetap standar JWT sehingga
// frontend tidak perlu berubah.

const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret, usage) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

const DURATIONS = { s: 1, m: 60, h: 3600, d: 86400 };

function parseDuration(str) {
  const m = /^(\d+)([smhd])$/.exec(String(str).trim());
  if (!m) throw new Error(`JWT_EXPIRES tidak valid: ${str}`);
  return Number(m[1]) * DURATIONS[m[2]];
}

export async function signToken(payload, secret, expiresIn = '7d') {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + parseDuration(expiresIn) };
  const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const claim = b64url(enc.encode(JSON.stringify(body)));
  const data = `${head}.${claim}`;
  const sig = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

export class TokenError extends Error {
  constructor(name, message) {
    super(message);
    this.name = name;
  }
}

export async function verifyToken(token, secret) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new TokenError('JsonWebTokenError', 'Token tidak valid');
  const [head, claim, sig] = parts;

  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(head)));
  } catch {
    throw new TokenError('JsonWebTokenError', 'Token tidak valid');
  }
  if (header.alg !== 'HS256') throw new TokenError('JsonWebTokenError', 'Algoritma token tidak didukung');

  const expected = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), enc.encode(`${head}.${claim}`));
  const got = b64urlDecode(sig);
  const exp = new Uint8Array(expected);
  if (got.length !== exp.length) throw new TokenError('JsonWebTokenError', 'Token tidak valid');
  let diff = 0;
  for (let i = 0; i < exp.length; i++) diff |= got[i] ^ exp[i];
  if (diff !== 0) throw new TokenError('JsonWebTokenError', 'Token tidak valid');

  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(b64urlDecode(claim)));
  } catch {
    throw new TokenError('JsonWebTokenError', 'Token tidak valid');
  }
  if (typeof body.exp === 'number' && Math.floor(Date.now() / 1000) >= body.exp) {
    throw new TokenError('TokenExpiredError', 'Token kedaluwarsa');
  }
  return body;
}