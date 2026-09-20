import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatRp,
  monthRange,
  nextBalance,
  parseAmountId,
  validateTransaction,
  validateTransfer,
} from '../money.ts';

test('parseAmountId: polos, ribuan titik, desimal koma', () => {
  assert.equal(parseAmountId('15000'), 15000);
  assert.equal(parseAmountId('15.000'), 15000);
  assert.equal(parseAmountId('1.500.000'), 1500000);
  assert.equal(parseAmountId('15.000,50'), 15000.5);
  assert.equal(parseAmountId(' 2.500 '), 2500);
});

test('parseAmountId: sampah ditolak', () => {
  assert.equal(parseAmountId(''), null);
  assert.equal(parseAmountId('abc'), null);
  assert.equal(parseAmountId('12,34,56'), null);
  assert.equal(parseAmountId('-,.<'), null);
  assert.equal(parseAmountId('12a34'), null);
});

test('nextBalance: expense kurang, income tambah', () => {
  assert.equal(nextBalance(100_000, 'expense', 25_000), 75_000);
  assert.equal(nextBalance(100_000, 'income', 25_000), 125_000);
  assert.equal(nextBalance(0, 'expense', 5000), -5000);
});

test('validateTransaction: pesan Indonesia, kosong bila valid', () => {
  assert.deepEqual(validateTransaction({ pocketId: 1, type: 'expense', amount: 5000 }), []);
  assert.ok(validateTransaction({ pocketId: 1, type: 'expense', amount: 0 }).length > 0);
  assert.ok(validateTransaction({ pocketId: 1, type: 'expense', amount: -5 }).length > 0);
  assert.ok(validateTransaction({ pocketId: 1, type: 'expense', amount: null }).length > 0);
  assert.ok(validateTransaction({ pocketId: null, type: 'expense', amount: 5000 }).length > 0);
});

test('validateTransfer: beda kantong, nominal positif', () => {
  assert.deepEqual(validateTransfer({ fromId: 1, toId: 2, amount: 1000 }), []);
  assert.ok(validateTransfer({ fromId: 1, toId: 1, amount: 1000 }).length > 0);
  assert.ok(validateTransfer({ fromId: 1, toId: 2, amount: 0 }).length > 0);
  assert.ok(validateTransfer({ fromId: null, toId: 2, amount: 1000 }).length > 0);
});

test('formatRp + monthRange', () => {
  assert.equal(formatRp(15000), 'Rp15.000');
  const { start, end } = monthRange(new Date(2026, 8, 20));
  assert.equal(new Date(start).getDate(), 1);
  assert.ok(end > start);
  assert.equal(new Date(end).getMonth(), 9);
});
