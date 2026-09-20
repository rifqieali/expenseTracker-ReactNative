import { and, desc, gte, lt, notInArray, eq } from 'drizzle-orm';

import { pockets, transactions } from '../db/schema.ts';
import type { Pocket, Transaction } from '../db/schema.ts';
import { monthRange } from './money.ts';
import { NON_SPEND_CATEGORIES } from './pockets.ts';
import type { AppDb } from './seed.ts';

const NON_SPEND_LIST: string[] = [...NON_SPEND_CATEGORIES];
const MAX_RECENT = 50;

/* ---- Pure helpers (dipakai lib + UI agar aturan agregat tunggal) ---- */

/** Jumlahkan saldo kantong. */
export function totalBalanceOf(rows: { balance: number }[]): number {
  return rows.reduce((acc, r) => acc + r.balance, 0);
}

/** Pisahkan income/expense dari baris bulan (transfer sudah difilter di SQL). */
export function summarizeMonthRows(rows: { type: string; amount: number }[]): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.type === 'income') income += r.amount;
    else expense += r.amount;
  }
  return { income, expense };
}

/** Peta pemakaian expense per kantong dari baris bulan. */
export function expenseUsageByPocket(rows: { type: string; pocketId: number; amount: number }[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.type !== 'expense') continue;
    map.set(r.pocketId, (map.get(r.pocketId) ?? 0) + r.amount);
  }
  return map;
}

/** Proporsi budget 0..1 (0 bila tanpa batas). */
export function budgetProgress(budgetLimit: number, used: number): number {
  return budgetLimit > 0 ? Math.min(used / budgetLimit, 1) : 0;
}

/** Sisa budget (null = tanpa batas). */
export function remainingBudget(budgetLimit: number, used: number): number | null {
  return budgetLimit > 0 ? budgetLimit - used : null;
}

/* ---- One-shot queries (diuji unit; UI mirror via live query) ---- */

/** Total saldo = jumlah saldo semua kantong (konsisten dengan hasil seam ledger). */
export async function getTotalBalance(db: AppDb): Promise<number> {
  const rows = await db.select({ balance: pockets.balance }).from(pockets);
  return totalBalanceOf(rows);
}

export interface MonthSummary {
  income: number;
  expense: number;
  start: number;
  end: number;
}

/**
 * Ringkasan bulan berjalan. Pindah dana internal (kategori non-spend)
 * dikecualikan agar tidak menggelembungkan income/expense.
 */
export async function getMonthSummary(db: AppDb, now: Date = new Date()): Promise<MonthSummary> {
  const { start, end } = monthRange(now);
  const rows = await db
    .select({ type: transactions.type, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        notInArray(transactions.category, NON_SPEND_LIST),
        gte(transactions.date, start),
        lt(transactions.date, end),
      ),
    );
  const { income, expense } = summarizeMonthRows(rows);
  return { income, expense, start, end };
}

/** N transaksi terakhir (desc), limit dijaga 1..50 agar home tetap cepat. */
export async function getRecentTransactions(db: AppDb, limit = 10): Promise<Transaction[]> {
  const safe = Math.min(Math.max(Math.round(limit) || 1, 1), MAX_RECENT);
  return db.select().from(transactions).orderBy(desc(transactions.date), desc(transactions.id)).limit(safe);
}

export interface PocketCard {
  pocket: Pocket;
  /** Belanja bulan berjalan di luar pindah dana. */
  used: number;
  /** Sisa budget (null = tanpa batas). */
  remaining: number | null;
  /** 0..1 proporsi budget terpakai. */
  progress: number;
}

/** Kartu kantong + pemakaian budget bulan berjalan untuk strip horizontal home. */
export async function getPocketCards(db: AppDb, now: Date = new Date()): Promise<PocketCard[]> {
  const { start, end } = monthRange(now);
  const all = await db.select().from(pockets);
  const spendRows = await db
    .select({ pocketId: transactions.pocketId, amount: transactions.amount, type: transactions.type })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, 'expense'),
        notInArray(transactions.category, NON_SPEND_LIST),
        gte(transactions.date, start),
        lt(transactions.date, end),
      ),
    );
  const usedBy = expenseUsageByPocket(spendRows);
  return all.map((pocket) => {
    const used = usedBy.get(pocket.id) ?? 0;
    return {
      pocket,
      used,
      remaining: remainingBudget(pocket.budgetLimit, used),
      progress: budgetProgress(pocket.budgetLimit, used),
    };
  });
}
