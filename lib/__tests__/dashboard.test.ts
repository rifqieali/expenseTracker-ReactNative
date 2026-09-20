import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recordTransaction as record, transferFunds } from '../ledger.ts';
import { updatePocket } from '../pockets.ts';
import { seedIfEmpty } from '../seed.ts';
import {
  getMonthSummary,
  getPocketCards,
  getRecentTransactions,
  getTotalBalance,
} from '../dashboard.ts';
import { makeDb } from './helpers.ts';

test('dashboard: total saldo = jumlah semua kantong', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    assert.equal(await getTotalBalance(db), 0);
    await record(db, { pocketId: 1, type: 'income', amount: 100000, category: 'Gaji' });
    await record(db, { pocketId: 2, type: 'expense', amount: 25000, category: 'Makan' });
    assert.equal(await getTotalBalance(db), 75000);
  } finally {
    close();
  }
});

test('dashboard: ringkasan bulan ini pisahkan income/expense, luar bulan + transfer dikecualikan', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    const now = new Date(2026, 8, 20); // 20 Sep 2026
    await record(db, {
      pocketId: 1, type: 'expense', amount: 40000, category: 'Makan',
      date: new Date(2026, 8, 5).getTime(),
    });
    await record(db, {
      pocketId: 1, type: 'income', amount: 200000, category: 'Gaji',
      date: new Date(2026, 8, 6).getTime(),
    });
    await record(db, {
      pocketId: 1, type: 'expense', amount: 99999, category: 'Makan',
      date: new Date(2026, 7, 5).getTime(), // Agustus → abaikan
    });
    await record(db, {
      pocketId: 1, type: 'income', amount: 100000, category: 'Gaji',
      date: new Date(2026, 8, 5).getTime(),
    });
    await transferFunds(db, { fromId: 1, toId: 2, amount: 30000 }); // bukan belanja/pemasukan riil
    const s = await getMonthSummary(db, now);
    assert.equal(s.expense, 40000);
    assert.equal(s.income, 300000);
  } finally {
    close();
  }
});

test('dashboard: 10 transaksi terakhir terurut desc + limit dijaga', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    const base = new Date(2026, 8, 1).getTime();
    for (let i = 0; i < 12; i++) {
      await record(db, {
        pocketId: 1, type: 'expense', amount: 1000 + i, category: 'Makan',
        date: base + i * 1000,
      });
    }
    const recent = await getRecentTransactions(db, 10);
    assert.equal(recent.length, 10);
    assert.ok(recent[0].date > recent[9].date);
    assert.equal(recent[0].amount, 1000 + 11);
    assert.deepEqual(await getRecentTransactions(db, 0), await getRecentTransactions(db, 1));
    assert.equal((await getRecentTransactions(db, 999)).length, 12);
  } finally {
    close();
  }
});

test('dashboard: kartu kantong bawa sisa + progress budget proporsional', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    await updatePocket(db, 1, { budgetLimit: 100000 });
    const now = new Date(2026, 8, 20);
    await record(db, {
      pocketId: 1, type: 'expense', amount: 25000, category: 'Makan',
      date: new Date(2026, 8, 5).getTime(),
    });
    const cards = await getPocketCards(db, now);
    const utama = cards.find((c) => c.pocket.id === 1);
    assert.ok(utama);
    assert.equal(utama.used, 25000);
    assert.equal(utama.remaining, 75000);
    assert.equal(utama.progress, 0.25);
    const tanpaBudget = cards.find((c) => c.pocket.id === 2);
    assert.ok(tanpaBudget);
    assert.equal(tanpaBudget.remaining, null);
    assert.equal(tanpaBudget.progress, 0);
  } finally {
    close();
  }
});
