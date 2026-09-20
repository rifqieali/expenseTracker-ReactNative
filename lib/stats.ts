import { and, eq, gte, lt, notInArray } from 'drizzle-orm';

import { transactions } from '../db/schema.ts';
import { NON_SPEND_CATEGORIES } from './pockets.ts';
import type { AppDb } from './seed.ts';

const NON_SPEND_LIST: string[] = [...NON_SPEND_CATEGORIES];
const MAX_MONTHS = 12;

const MONTH_SHORT_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export interface MonthBucket {
  key: string;
  label: string;
  year: number;
  month: number; // 0-based
  start: number; // epoch-ms awal bulan
  end: number; // epoch-ms awal bulan berikut
}

/** N bulan terakhir s/d bulan `now`, tertua dulu. Count dijaga 1..12. */
export function lastMonths(now: Date = new Date(), count = 6): MonthBucket[] {
  const safe = Math.min(Math.max(Math.round(count) || 1, 1), MAX_MONTHS);
  const out: MonthBucket[] = [];
  for (let i = safe - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    out.push({
      key: `${y}-${m}`,
      label: `${MONTH_SHORT_ID[m]} ${String(y).slice(2)}`,
      year: y,
      month: m,
      start: d.getTime(),
      end: new Date(y, m + 1, 1).getTime(),
    });
  }
  return out;
}

export interface MonthlyPoint extends MonthBucket {
  income: number;
  expense: number;
}

/** Kelompokkan baris transaksi ke bucket bulan (tanggal liar diabaikan). */
export function bucketMonthly(
  rows: { type: string; amount: number; date: number }[],
  months: MonthBucket[],
): MonthlyPoint[] {
  const points: MonthlyPoint[] = months.map((m) => ({ ...m, income: 0, expense: 0 }));
  const byStart = new Map(months.map((m, i) => [m.key, i]));
  for (const r of rows) {
    const d = new Date(r.date);
    const idx = byStart.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (idx == null) continue;
    if (r.type === 'income') points[idx].income += r.amount;
    else points[idx].expense += r.amount;
  }
  return points;
}

export interface CategorySlice {
  category: string;
  total: number;
  /** 0..1 porsi terhadap total breakdown. */
  share: number;
}

/** Kelompokkan baris per kategori, urut desc + share proporsional. */
export function breakdownByCategory(rows: { category: string; amount: number }[]): CategorySlice[] {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const r of rows) {
    totals.set(r.category, (totals.get(r.category) ?? 0) + r.amount);
    grand += r.amount;
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total, share: grand > 0 ? total / grand : 0 }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Series pemasukan vs pengeluaran N bulan terakhir dari data lokal.
 * Pindah dana internal dikecualikan agar konsisten dengan dashboard.
 */
export async function getMonthlySeries(
  db: AppDb,
  now: Date = new Date(),
  count = 6,
): Promise<MonthlyPoint[]> {
  const months = lastMonths(now, count);
  const rows = await db
    .select({ type: transactions.type, amount: transactions.amount, date: transactions.date })
    .from(transactions)
    .where(
      and(
        notInArray(transactions.category, NON_SPEND_LIST),
        gte(transactions.date, months[0].start),
        lt(transactions.date, months[months.length - 1].end),
      ),
    );
  return bucketMonthly(rows, months);
}

/**
 * Breakdown per kategori pada rentang [start, end) untuk satu tipe.
 * Total breakdown == komponen series pada bulan yang sama (konsisten).
 */
export async function getCategoryBreakdown(
  db: AppDb,
  start: number,
  end: number,
  type: 'expense' | 'income' = 'expense',
): Promise<CategorySlice[]> {
  const rows = await db
    .select({ category: transactions.category, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, type),
        notInArray(transactions.category, NON_SPEND_LIST),
        gte(transactions.date, start),
        lt(transactions.date, end),
      ),
    );
  return breakdownByCategory(rows);
}
