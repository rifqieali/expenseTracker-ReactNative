import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';

import { pockets } from '../../db/schema.ts';
import { recordTransaction } from '../ledger.ts';
import { createPocket, deletePocket, monthExpenseByPocket, updatePocket } from '../pockets.ts';
import { ValidationError } from '../errors.ts';
import { transferFunds } from '../ledger.ts';
import { seedIfEmpty } from '../seed.ts';
import { makeDb } from './helpers.ts';

test('pockets: create + duplikat + nama kosong + budget negatif', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    const id = await createPocket(db, { name: 'Darurat', icon: '🚨', budgetLimit: 500000 });
    assert.ok(id > 0);
    await assert.rejects(createPocket(db, { name: 'Darurat' }), ValidationError);
    await assert.rejects(createPocket(db, { name: '   ' }), ValidationError);
    await assert.rejects(createPocket(db, { name: 'X', budgetLimit: -1 }), ValidationError);
  } finally {
    close();
  }
});

test('pockets: update nama + budget, tolak duplikat', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    await updatePocket(db, 1, { name: 'Harian', budgetLimit: 2000000 });
    const row = (await db.select().from(pockets).where(eq(pockets.id, 1)))[0];
    assert.equal(row.name, 'Harian');
    assert.equal(row.budgetLimit, 2000000);
    await assert.rejects(updatePocket(db, 1, { name: 'Jajan' }), ValidationError);
    await assert.rejects(updatePocket(db, 999, { name: 'X' }), ValidationError);
  } finally {
    close();
  }
});

test('pockets: hapus dilindungi bila ber-riwayat, boleh bila kosong', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    await recordTransaction(db, { pocketId: 1, type: 'expense', amount: 5000, category: 'Makan' });
    await assert.rejects(deletePocket(db, 1), ValidationError);
    const id = await createPocket(db, { name: 'Sementara' });
    await deletePocket(db, id);
    assert.equal((await db.select().from(pockets).where(eq(pockets.id, id))).length, 0);
  } finally {
    close();
  }
});

test('pockets: monthExpenseByPocket hanya hitung bulan berjalan', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    const now = new Date(2026, 8, 20); // 20 Sep 2026
    await recordTransaction(db, {
      pocketId: 1, type: 'expense', amount: 10000, category: 'Makan',
      date: new Date(2026, 8, 5).getTime(),
    });
    await recordTransaction(db, {
      pocketId: 1, type: 'expense', amount: 90000, category: 'Makan',
      date: new Date(2026, 7, 5).getTime(), // Agustus, di luar bulan
    });
    await recordTransaction(db, {
      pocketId: 1, type: 'income', amount: 50000, category: 'Gaji',
      date: new Date(2026, 8, 6).getTime(), // income tidak dihitung
    });
    assert.equal(await monthExpenseByPocket(db, 1, now), 10000);
  } finally {
    close();
  }
});

test('pockets: pindah dana tidak dihitung sebagai belanja budget', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    const now = new Date(2026, 8, 20);
    await recordTransaction(db, {
      pocketId: 1, type: 'income', amount: 100000, category: 'Gaji',
      date: new Date(2026, 8, 5).getTime(),
    });
    await transferFunds(db, { fromId: 1, toId: 2, amount: 30000 });
    assert.equal(await monthExpenseByPocket(db, 1, now), 0);
  } finally {
    close();
  }
});
