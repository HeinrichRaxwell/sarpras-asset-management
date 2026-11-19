import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { signToken, verifyToken, TokenError } from '../src/jwt.js';

const require = createRequire(import.meta.url);
const jwt = require('../../backend/node_modules/jsonwebtoken');

const SECRET = 'test-secret-yang-cukup-panjang-untuk-hs256';
const payload = { id: 1, username: 'admin', role: 'admin' };

// 1. token dari WebCrypto harus bisa diverifikasi jsonwebtoken asli
const mine = await signToken(payload, SECRET, '7d');
const viaLib = jwt.verify(mine, SECRET);
assert.equal(viaLib.id, 1);
assert.equal(viaLib.username, 'admin');
assert.equal(viaLib.role, 'admin');
assert.ok(viaLib.exp > Math.floor(Date.now() / 1000));
console.log('OK  token WebCrypto diverifikasi jsonwebtoken asli');

// 2. token dari jsonwebtoken harus bisa diverifikasi WebCrypto
const theirs = jwt.sign(payload, SECRET, { expiresIn: '7d' });
const viaMine = await verifyToken(theirs, SECRET);
assert.equal(viaMine.username, 'admin');
assert.equal(viaMine.role, 'admin');
console.log('OK  token jsonwebtoken diverifikasi WebCrypto');

// 3. secret salah harus ditolak
await assert.rejects(() => verifyToken(mine, 'secret-salah'), (e) => e instanceof TokenError);
console.log('OK  secret salah ditolak');

// 4. token kedaluwarsa
const expired = jwt.sign(payload, SECRET, { expiresIn: '-1s' });
await assert.rejects(() => verifyToken(expired, SECRET), (e) => e.name === 'TokenExpiredError');
console.log('OK  token kedaluwarsa -> TokenExpiredError');

// 5. payload dimodifikasi (signature tidak cocok)
const [h, c, s] = mine.split('.');
const tampered = `${h}.${Buffer.from(JSON.stringify({ ...payload, role: 'admin', id: 999 })).toString('base64url')}.${s}`;
await assert.rejects(() => verifyToken(tampered, SECRET), (e) => e instanceof TokenError);
console.log('OK  payload dimodifikasi ditolak');

// 6. alg none harus ditolak (serangan klasik)
const noneHead = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
await assert.rejects(() => verifyToken(`${noneHead}.${c}.`, SECRET), (e) => e instanceof TokenError);
console.log('OK  alg=none ditolak');

// 7. token rusak
for (const bad of ['', 'abc', 'a.b', 'a.b.c.d']) {
  await assert.rejects(() => verifyToken(bad, SECRET), (e) => e instanceof TokenError);
}
console.log('OK  token malformed ditolak');

// 8. durasi
const short = await signToken(payload, SECRET, '1h');
const decoded = await verifyToken(short, SECRET);
assert.ok(decoded.exp - decoded.iat === 3600, '1h harus 3600 detik');
console.log('OK  parse durasi 1h');

console.log('\njwt: semua assert lolos');