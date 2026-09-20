import { and, eq, gte, lt, ne, sum } from 'drizzle-orm';

import { pockets, transactions } from '../db/schema.ts';
import { ValidationError } from './errors.ts';
import { monthRange } from './money.ts';
import type { AppDb } from './seed.ts';

export interface PocketInput {
  name: string;
  icon?: string;
  color?: string;
  budgetLimit?: number;
}

/** Kategori internal yang bukan belanja (pindah dana) — dikecualikan dari budget. */
export const NON_SPEND_CATEGORIES = ['Transfer'] as const;

async function assertNameFree(db: AppDb, name: string, excludeId?: number): Promise<void> {
  const dupe = await db.select({ id: pockets.id }).from(pockets).where(eq(pockets.name, name)).limit(1);
  if (dupe.length > 0 && dupe[0].id !== excludeId) {
    throw new ValidationError(['Nama kantong sudah dipakai.']);
  }
}

/** Buat kantong baru. @returns id kantong. */
export async function createPocket(db: AppDb, input: PocketInput): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new ValidationError(['Nama kantong wajib diisi.']);
  if ((input.budgetLimit ?? 0) < 0) throw new ValidationError(['Budget tidak boleh negatif.']);
  await assertNameFree(db, name);
  const rows = await db
    .insert(pockets)
    .values({
      name,
      icon: input.icon ?? '💰',
      color: input.color ?? '#2F80ED',
      balance: 0,
      budgetLimit: input.budgetLimit ?? 0,
    })
    .returning({ id: pockets.id });
  return rows[0].id;
}

export interface PocketPatch {
  name?: string;
  icon?: string;
  color?: string;
  budgetLimit?: number;
}

/** Ubah kantong. Hanya field yang diisi yang berubah. */
export async function updatePocket(db: AppDb, id: number, patch: PocketPatch): Promise<void> {
  const current = (await db.select().from(pockets).where(eq(pockets.id, id)).limit(1))[0];
  if (!current) throw new ValidationError(['Kantong tidak ditemukan.']);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new ValidationError(['Nama kantong wajib diisi.']);
    await assertNameFree(db, name, id);
    patch = { ...patch, name };
  }
  if (patch.budgetLimit !== undefined && patch.budgetLimit < 0) {
    throw new ValidationError(['Budget tidak boleh negatif.']);
  }
  await db.update(pockets).set(patch).where(eq(pockets.id, id));
}

/** Hapus kantong kosong (tanpa riwayat). Kantong ber-riwayat dilindungi. */
export async function deletePocket(db: AppDb, id: number): Promise<void> {
  const current = (await db.select().from(pockets).where(eq(pockets.id, id)).limit(1))[0];
  if (!current) throw new ValidationError(['Kantong tidak ditemukan.']);
  const used = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.pocketId, id)).limit(1);
  if (used.length > 0) throw new ValidationError(['Kantong memiliki riwayat transaksi, tidak bisa dihapus.']);
  await db.delete(pockets).where(eq(pockets.id, id));
}

/** Total belanja (di luar pindah dana internal) kantong pada bulan berjalan. */
export async function monthExpenseByPocket(db: AppDb, pocketId: number, now: Date = new Date()): Promise<number> {
  const { start, end } = monthRange(now);
  const rows = await db
    .select({ total: sum(transactions.amount) })
    .from(transactions)
    .where(
      and(
        eq(transactions.pocketId, pocketId),
        eq(transactions.type, 'expense'),
        ne(transactions.category, 'Transfer'),
        gte(transactions.date, start),
        lt(transactions.date, end),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}
