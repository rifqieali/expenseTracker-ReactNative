import { eq } from 'drizzle-orm';

import { pockets, transactions } from '../db/schema.ts';
import { ValidationError } from './errors.ts';
import { nextBalance, validateTransaction, validateTransfer } from './money.ts';
import type { TransferInput, TxInput, TxType } from './money.ts';
import type { AppDb } from './seed.ts';

export { ValidationError };

export interface RecordInput extends TxInput {
  category: string;
  note?: string;
  date?: number;
}

/**
 * Seam utama: catat transaksi + mutasi saldo kantong dalam SATU transaksi atomik.
 * Expense mengurangi saldo, income menambah. Gagal total bila validasi/input cacat.
 * @returns id baris transaksi.
 */
export async function recordTransaction(db: AppDb, input: RecordInput): Promise<number> {
  const errors = validateTransaction(input);
  if (errors.length > 0 || input.pocketId == null || input.amount == null) {
    throw new ValidationError(errors.length > 0 ? errors : ['Input tidak valid.']);
  }
  const pocketId = input.pocketId;
  const amount = input.amount;

  const pocket = (await db.select().from(pockets).where(eq(pockets.id, pocketId)).limit(1))[0];
  if (!pocket) throw new ValidationError(['Kantong tidak ditemukan.']);

  const date = input.date ?? Date.now();
  const balance = nextBalance(pocket.balance, input.type, amount);

  let txId = -1;
  await db.transaction((tx) => {
    const rows = tx
      .insert(transactions)
      .values({
        pocketId,
        type: input.type,
        amount,
        category: input.category,
        note: input.note ?? '',
        date,
      })
      .returning({ id: transactions.id })
      .all();
    txId = rows[0].id;
    tx.update(pockets).set({ balance }).where(eq(pockets.id, pocketId)).run();
  });
  return txId;
}

export interface TransferArgs extends TransferInput {
  note?: string;
}

/**
 * Pindah dana: mutasi kedua saldo + sepasang baris riwayat (Transfer keluar/masuk)
 * dalam SATU transaksi atomik. Riwayat berpasangan menjaga agregat tetap konsisten.
 */
export async function transferFunds(db: AppDb, args: TransferArgs): Promise<void> {
  const errors = validateTransfer(args);
  if (errors.length > 0 || args.fromId == null || args.toId == null || args.amount == null) {
    throw new ValidationError(errors.length > 0 ? errors : ['Input tidak valid.']);
  }
  const fromId = args.fromId;
  const toId = args.toId;
  const amount = args.amount;

  const rows = await db.select().from(pockets);
  const from = rows.find((p) => p.id === fromId);
  const to = rows.find((p) => p.id === toId);
  if (!from || !to) throw new ValidationError(['Kantong tidak ditemukan.']);

  const date = Date.now();
  const note = args.note ?? '';
  await db.transaction((tx) => {
    tx.insert(transactions)
      .values({ pocketId: from.id, type: 'expense' as TxType, amount, category: 'Transfer', note, date })
      .run();
    tx.insert(transactions)
      .values({ pocketId: to.id, type: 'income' as TxType, amount, category: 'Transfer', note, date })
      .run();
    tx.update(pockets).set({ balance: from.balance - amount }).where(eq(pockets.id, from.id)).run();
    tx.update(pockets).set({ balance: to.balance + amount }).where(eq(pockets.id, to.id)).run();
  });
}
