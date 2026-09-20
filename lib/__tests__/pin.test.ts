import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTO_LOCK_MS,
  MAX_ATTEMPTS,
  bytesToHex,
  hashPin,
  isValidPinFormat,
  lockoutRemainingMs,
  sha256Hex,
  shouldAutoLock,
  verifyPin,
} from '../pin.ts';

test('pin: sha256Hex cocok vektor standar', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
});

test('pin: format 6 digit, selain itu tolak', () => {
  assert.equal(isValidPinFormat('123456'), true);
  assert.equal(isValidPinFormat('000000'), true);
  for (const bad of ['', '12345', '1234567', 'abcdef', '12 456', '12345a', '١٢٣٤٥٦']) {
    assert.equal(isValidPinFormat(bad), false);
  }
});

test('pin: bytesToHex + hash deterministik, salt beda hasil beda', () => {
  assert.equal(bytesToHex(new Uint8Array([0, 15, 255])), '000fff');
  const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  assert.equal(hashPin('123456', salt), hashPin('123456', salt));
  assert.notEqual(hashPin('123456', salt), hashPin('123456', 'f1'.repeat(16)));
  assert.equal(hashPin('123456', salt).length, 64);
});

test('pin: verify benar terima, salah tolak', () => {
  const salt = '00112233445566778899aabbccddeeff';
  const hash = hashPin('654321', salt);
  assert.equal(verifyPin('654321', salt, hash), true);
  assert.equal(verifyPin('654320', salt, hash), false);
  assert.equal(verifyPin('654321', salt, `${'0'.repeat(63)}1`), false);
  assert.equal(verifyPin('12', salt, hash), false); // format cacat langsung false
});

test('pin: lockout 0 sebelum 5 gagal, lalu backoff eksponensial max 15 mnt', () => {
  assert.equal(MAX_ATTEMPTS, 5);
  const now = 1_000_000;
  assert.equal(lockoutRemainingMs(0, 0, now), 0);
  assert.equal(lockoutRemainingMs(4, 0, now), 0);
  assert.equal(lockoutRemainingMs(5, now - 29_000, now), 1_000);
  assert.equal(lockoutRemainingMs(5, now - 31_000, now), 0);
  assert.equal(lockoutRemainingMs(6, now, now), 60_000);
  assert.equal(lockoutRemainingMs(99, now, now), 900_000);
});

test('pin: auto-lock 2 menit background; null tidak kunci', () => {
  assert.equal(AUTO_LOCK_MS, 120_000);
  const now = 5_000_000;
  assert.equal(shouldAutoLock(null, now), false);
  assert.equal(shouldAutoLock(now - 119_000, now), false);
  assert.equal(shouldAutoLock(now - 121_000, now), true);
});
