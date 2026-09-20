import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';
import { categories, pockets } from './schema';

const DB_NAME = 'expense.db';

const expoDb = openDatabaseSync(DB_NAME);

export const db: ExpoSQLiteDatabase<typeof schema> = drizzle(expoDb, { schema });

const SEED_POCKETS: (typeof pockets.$inferInsert)[] = [
  { name: 'Utama', icon: '🏠', color: '#2F80ED', balance: 0, budgetLimit: 0 },
  { name: 'Jajan', icon: '🍜', color: '#F2994A', balance: 0, budgetLimit: 0 },
  { name: 'Tabungan', icon: '🐷', color: '#27AE60', balance: 0, budgetLimit: 0 },
];

const SEED_CATEGORIES: (typeof categories.$inferInsert)[] = [
  { name: 'Makan', icon: '🍚', kind: 'expense' },
  { name: 'Transport', icon: '🛵', kind: 'expense' },
  { name: 'Belanja', icon: '🛒', kind: 'expense' },
  { name: 'Tagihan', icon: '🧾', kind: 'expense' },
  { name: 'Gaji', icon: '💵', kind: 'income' },
  { name: 'Lainnya', icon: '💸', kind: 'expense' },
];

/**
 * Seed kantong + kategori bawaan bila DB masih kosong.
 * @returns true bila seeding dilakukan, false bila data sudah ada.
 */
export async function seedIfEmpty(): Promise<boolean> {
  const existing = await db.select({ id: pockets.id }).from(pockets).limit(1);
  if (existing.length > 0) return false;
  await db.insert(pockets).values(SEED_POCKETS);
  await db.insert(categories).values(SEED_CATEGORIES);
  return true;
}
