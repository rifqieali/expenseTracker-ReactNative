import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recordTransaction as record, transferFunds } from '../ledger.ts';
import { seedIfEmpty } from '../seed.ts';
import {
  breakdownByCategory,
  bucketMonthly,
  getCategoryBreakdown,
  getMonthlySeries,
  lastMonths,
} from '../stats.ts';
import { makeDb } from '../__tests__/helpers.ts';

test('stats: lastMonths N bucket tertua-dulu dengan batas benar', () => {
  const now = new Date(2026, 8, 20); // Sep 2026
  const months = lastMonths(now, 3);
  assert.deepEqual(months.map((m) => m.key), ['2026-7', '2026-8', '2026-9']);
  assert.equal(months[2].start, new Date(2026, 8, 1).getTime());
  assert.equal(months[2].end, new Date(2026, 9, 1).getTime());
  assert.match(months[2].label, /Sep/);
  assert.deepEqual(lastMonths(now, 0).length, 6); // default 6 when falsy
});

test('stats: series bulanan pisahkan income/expense, transfer + luar rentang dikecualikan', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    const d = (y: number, m: number, day: number) => new Date(y, m, day).getTime();
    await record(db, { pocketId: 1, type: 'expense', amount: 40000, category: 'Makan', date: d(2026, 8, 5) });
    await record(db, { pocketId: 1, type: 'income', amount: 200000, category: 'Gaji', date: d(2026, 8, 6) });
    await record(db, { pocketId: 1, type: 'expense', amount: 10000, category: 'Makan', date: d(2026, 7, 5) });
    await record(db, { pocketId: 1, type: 'expense', amount: 99999, category: 'Makan', date: d(2026, 5, 5) }); // di luar 3 bulan
    await record(db, { pocketId: 1, type: 'income', amount: 100000, category: 'Gaji', date: d(2026, 8, 5) });
    await transferFunds(db, { fromId: 1, toId: 2, amount: 30000 }); // bukan riil
    const series = await getMonthlySeries(db, new Date(2026, 8, 20), 3);
    assert.equal(series.length, 3);
    const sep = series[2];
    assert.equal(sep.income, 300000);
    assert.equal(sep.expense, 40000);
    assert.equal(series[1].expense, 10000);
    assert.equal(series[0].income, 0);
  } finally {
    close();
  }
});

test('stats: breakdown konsisten dengan total series bulan itu', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    const d = (day: number) => new Date(2026, 8, day).getTime();
    await record(db, { pocketId: 1, type: 'expense', amount: 30000, category: 'Makan', date: d(5) });
    await record(db, { pocketId: 1, type: 'expense', amount: 10000, category: 'Transport', date: d(6) });
    await record(db, { pocketId: 2, type: 'expense', amount: 20000, category: 'Makan', date: d(7) });
    await record(db, { pocketId: 1, type: 'income', amount: 50000, category: 'Gaji', date: d(8) });
    const start = new Date(2026, 8, 1).getTime();
    const end = new Date(2026, 9, 1).getTime();
    const exp = await getCategoryBreakdown(db, start, end, 'expense');
    assert.deepEqual(exp.map((b) => b.category), ['Makan', 'Transport']);
    assert.equal(exp.reduce((a, b) => a + b.total, 0), 60000);
    const series = await getMonthlySeries(db, new Date(2026, 8, 20), 1);
    assert.equal(series[0].expense, 60000); // konsisten
    assert.equal(series[0].income, 50000);
    const inc = await getCategoryBreakdown(db, start, end, 'income');
    assert.equal(inc.reduce((a, b) => a + b.total, 0), 50000);
    // pure helper: urut desc + share proporsional
    const pure = breakdownByCategory([
      { category: 'A', amount: 10 },
      { category: 'B', amount: 30 },
      { category: 'A', amount: 20 },
    ]);
    assert.deepEqual(pure.map((b) => b.category), ['A', 'B']);
    assert.equal(pure[0].share, 0.5);
  } finally {
    close();
  }
});

test('stats: bulan kosong → nol + [] tanpa crash; bucketMonthly abaikan tanggal liar', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    const series = await getMonthlySeries(db, new Date(2026, 8, 20), 2);
    assert.ok(series.every((s) => s.income === 0 && s.expense === 0));
    const start = new Date(2026, 8, 1).getTime();
    const end = new Date(2026, 9, 1).getTime();
    assert.deepEqual(await getCategoryBreakdown(db, start, end, 'expense'), []);
    const months = lastMonths(new Date(2026, 8, 20), 1);
    const bucketed = bucketMonthly(
      [{ type: 'expense', amount: 5, date: new Date(2020, 0, 1).getTime() }],
      months,
    );
    assert.equal(bucketed[0].expense, 0);
  } finally {
    close();
  }
});
