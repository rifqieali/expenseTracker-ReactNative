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

export interface EditTransactionInput {
  id: number;
  pocketId: number;
  type: TxType;
  amount: number;
  category: string;
  note?: string;
  date?: number;
}

/**
 * Edit transaksi: balikkan saldo lama, terapkan saldo baru, update data transaksi.
 * Semua dalam SATU transaksi atomik.
 */
export async function updateTransaction(db: AppDb, input: EditTransactionInput): Promise<void> {
  const { id, pocketId, type, amount, category, note, date } = input;

  if (amount <= 0) {
    throw new ValidationError(['Nominal harus lebih dari 0.']);
  }

  // Ambil transaksi lama
  const oldTx = (await db.select().from(transactions).where(eq(transactions.id, id)).limit(1))[0];
  if (!oldTx) throw new ValidationError(['Transaksi tidak ditemukan.']);

  // Ambil kantong baru
  const newPocket = (await db.select().from(pockets).where(eq(pockets.id, pocketId)).limit(1))[0];
  if (!newPocket) throw new ValidationError(['Kantong tidak ditemukan.']);

  // Jika kantong berbeda, ambil kantong lama juga
  const oldPocket = oldTx.pocketId !== pocketId
    ? (await db.select().from(pockets).where(eq(pockets.id, oldTx.pocketId)).limit(1))[0]
    : newPocket;

  if (!oldPocket) throw new ValidationError(['Kantong lama tidak ditemukan.']);

  // Hitung saldo baru
  const oldBalanceWithoutTx = reverseBalance(oldPocket.balance, oldTx.type, oldTx.amount);
  const newBalance = nextBalance(oldBalanceWithoutTx, type, amount);

  // Jika pindah kantong, hitung saldo kantong lama juga
  let oldPocketNewBalance: number | undefined;
  if (oldTx.pocketId !== pocketId) {
    oldPocketNewBalance = reverseBalance(oldPocket.balance, oldTx.type, oldTx.amount);
  }

  await db.transaction((tx) => {
    // Update transaksi
    tx.update(transactions)
      .set({
        pocketId,
        type,
        amount,
        category,
        note: note ?? '',
        date: date ?? oldTx.date,
      })
      .where(eq(transactions.id, id))
      .run();

    // Update saldo kantong baru
    tx.update(pockets).set({ balance: newBalance }).where(eq(pockets.id, pocketId)).run();

    // Update saldo kantong lama jika berbeda
    if (oldPocketNewBalance !== undefined) {
      tx.update(pockets).set({ balance: oldPocketNewBalance }).where(eq(pockets.id, oldTx.pocketId)).run();
    }
  });
}

/**
 * Hapus transaksi dan balikkan saldo kantong.
 * Semua dalam SATU transaksi atomik.
 */
export async function deleteTransaction(db: AppDb, txId: number): Promise<void> {
  const tx = (await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1))[0];
  if (!tx) throw new ValidationError(['Transaksi tidak ditemukan.']);

  // Transfer tidak bisa dihapus (pasangan)
  if (tx.category === 'Transfer') {
    throw new ValidationError(['Transaksi transfer tidak bisa dihapus langsung.']);
  }

  const pocket = (await db.select().from(pockets).where(eq(pockets.id, tx.pocketId)).limit(1))[0];
  if (!pocket) throw new ValidationError(['Kantong tidak ditemukan.']);

  // Balikkan saldo
  const balance = reverseBalance(pocket.balance, tx.type, tx.amount);

  await db.transaction((dbrx) => {
    dbrx.delete(transactions).where(eq(transactions.id, txId)).run();
    dbrx.update(pockets).set({ balance }).where(eq(pockets.id, tx.pocketId)).run();
  });
}

/** Balikkan efek transaksi pada saldo (reverse of nextBalance). */
function reverseBalance(current: number, type: TxType, amount: number): number {
  return type === 'expense' ? current + amount : current - amount;
}
