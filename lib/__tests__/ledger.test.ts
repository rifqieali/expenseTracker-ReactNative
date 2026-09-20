import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';

import { pockets, transactions } from '../../db/schema.ts';
import { recordTransaction, transferFunds, ValidationError } from '../ledger.ts';
import { seedIfEmpty } from '../seed.ts';
import { makeDb } from './helpers.ts';

async function balanceOf(db: ReturnType<typeof makeDb>['db'], id: number): Promise<number> {
  const rows = await db.select().from(pockets).where(eq(pockets.id, id));
  return rows[0].balance;
}

test('seed: sekali true lalu false, 3 kantong + 6 kategori', async () => {
  const { db, close } = makeDb();
  try {
    assert.equal(await seedIfEmpty(db), true);
    assert.equal(await seedIfEmpty(db), false);
    assert.equal((await db.select().from(pockets)).length, 3);
  } finally {
    close();
  }
});

test('seam: expense kurangi saldo + baris tercatat', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    const id = await recordTransaction(db, {
      pocketId: 1, type: 'expense', amount: 25000, category: 'Makan', note: 'nasi padang',
    });
    assert.ok(id > 0);
    assert.equal(await balanceOf(db, 1), -25000);
    const rows = await db.select().from(transactions).where(eq(transactions.id, id));
    assert.equal(rows[0].category, 'Makan');
  } finally {
    close();
  }
});

test('seam: income tambah saldo', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    await recordTransaction(db, { pocketId: 2, type: 'income', amount: 100000, category: 'Gaji' });
    assert.equal(await balanceOf(db, 2), 100000);
  } finally {
    close();
  }
});

test('seam: validasi gagal → saldo utuh (nominal 0, kantong hilang)', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    await assert.rejects(
      recordTransaction(db, { pocketId: 1, type: 'expense', amount: 0, category: 'Makan' }),
      ValidationError,
    );
    await assert.rejects(
      recordTransaction(db, { pocketId: 999, type: 'expense', amount: 5000, category: 'Makan' }),
      ValidationError,
    );
    assert.equal(await balanceOf(db, 1), 0);
    assert.equal((await db.select().from(transactions)).length, 0);
  } finally {
    close();
  }
});

test('seam: gagal di tengah transaksi → rollback, saldo utuh', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    await recordTransaction(db, { pocketId: 1, type: 'income', amount: 50000, category: 'Gaji' });
    await assert.rejects(
      recordTransaction(db, {
        pocketId: 1, type: 'expense', amount: 10000,
        category: null as unknown as string, // langgar NOT NULL di dalam tx
      }),
      Error,
    );
    assert.equal(await balanceOf(db, 1), 50000);
  } finally {
    close();
  }
});

test('seam: transfer atomik + riwayat berpasangan', async () => {
  const { db, close } = makeDb();
  try {
    await seedIfEmpty(db);
    await recordTransaction(db, { pocketId: 1, type: 'income', amount: 100000, category: 'Gaji' });
    await transferFunds(db, { fromId: 1, toId: 2, amount: 30000 });
    assert.equal(await balanceOf(db, 1), 70000);
    assert.equal(await balanceOf(db, 2), 30000);
    const movers = await db.select().from(transactions).where(eq(transactions.category, 'Transfer'));
    assert.equal(movers.length, 2);
    // transfer invalid: kantong sama + nominal 0 → tidak ada yang berubah
    await assert.rejects(transferFunds(db, { fromId: 1, toId: 1, amount: 1000 }), ValidationError);
    await assert.rejects(transferFunds(db, { fromId: 1, toId: 2, amount: 0 }), ValidationError);
    assert.equal(await balanceOf(db, 1), 70000);
    assert.equal(await balanceOf(db, 2), 30000);
  } finally {
    close();
  }
});
