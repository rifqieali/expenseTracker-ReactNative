/**
 * Seam kunci aplikasi v1: PIN 6-digit + hash+salt + lockout + auto-lock.
 * Murni TypeScript tanpa modul native — deterministik di node (test) dan
 * Hermes (device). Hash+salt disimpan di SecureStore (lihat lockStore.ts),
 * BUKAN di SQLite. Enkripsi full-DB (SQLCipher) dijadwalkan v2.
 */

export const PIN_LENGTH = 6;
export const PIN_ROUNDS = 5000;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_BASE_MS = 30_000;
export const LOCKOUT_MAX_MS = 900_000; // 15 menit
export const AUTO_LOCK_MS = 120_000; // 2 menit background

/** PIN valid = tepat 6 digit ASCII. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/** Uint8Array → hex lowercase (untuk salt acak dari getRandomBytes). */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

const SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * SHA-256 hex dari string ASCII (PIN + salt hex selalu ASCII, jadi encoder
 * mungil ini cukup — sengaja tanpa TextEncoder agar jalan di Hermes lawas).
 */
export function sha256Hex(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) bytes.push(input.charCodeAt(i) & 0xff);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // panjang 64-bit big-endian (cukup 32-bit bawah untuk input pendek)
  bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array<number>(64);

  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        ((bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3]) | 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA_K[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/** Hash PIN dengan salt + stretching. Deterministik, format hash 64 hex. */
export function hashPin(pin: string, salt: string, rounds: number = PIN_ROUNDS): string {
  let h = `${salt}:${pin}`;
  for (let i = 0; i < Math.max(1, Math.round(rounds)); i++) h = sha256Hex(h);
  return h;
}

/** Verifikasi PIN: format cacat atau hash beda → false (tanpa bocorkan alasan). */
export function verifyPin(pin: string, salt: string, expectedHash: string): boolean {
  if (!isValidPinFormat(pin) || expectedHash.length !== 64) return false;
  const actual = hashPin(pin, salt);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

/**
 * Sisa waktu lockout (ms) setelah `failCount` gagal beruntun.
 * Di bawah MAX_ATTEMPTS bebas coba; lalu 30s, 60s, 120s… max 15 menit.
 */
export function lockoutRemainingMs(failCount: number, lastFailAt: number, now: number): number {
  if (failCount < MAX_ATTEMPTS) return 0;
  const total = Math.min(LOCKOUT_BASE_MS * 2 ** (failCount - MAX_ATTEMPTS), LOCKOUT_MAX_MS);
  return Math.max(0, lastFailAt + total - now);
}

/** True bila jeda background ≥ 2 menit → kunci otomatis saat foreground. */
export function shouldAutoLock(backgroundedAt: number | null, now: number, timeoutMs: number = AUTO_LOCK_MS): boolean {
  return backgroundedAt != null && now - backgroundedAt >= timeoutMs;
}
