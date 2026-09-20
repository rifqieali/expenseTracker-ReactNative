import { eq } from 'drizzle-orm';

import { categories } from '../db/schema.ts';
import { ValidationError } from './errors.ts';
import type { AppDb } from './seed.ts';

export interface CategoryInput {
  name: string;
  icon?: string;
  kind: 'expense' | 'income';
}

const EXPENSE_ICONS = [
  'cart.fill', 'fork.knife', 'house.fill', 'car.fill', 'fuelpump.fill',
  'cross.fill', 'book.fill', 'gamecontroller.fill', 'film.fill', 'gift.fill',
  'bag.fill', 'tshirt.fill', 'wrench.fill', 'pawprint.fill', 'leaf.fill',
];

const INCOME_ICONS = [
  'banknotes', 'briefcase.fill', 'dollarsign.circle.fill', 'gift.fill',
  'creditcard.fill', 'wallet.pass.fill', 'arrow.down.circle.fill',
];

export function iconsForKind(kind: 'expense' | 'income'): string[] {
  return kind === 'expense' ? EXPENSE_ICONS : INCOME_ICONS;
}

async function assertNameFree(db: AppDb, name: string, kind: 'expense' | 'income', excludeId?: number): Promise<void> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, name))
    .limit(5);
  const dupe = rows.find((r) => r.id !== excludeId);
  if (dupe) {
    throw new ValidationError(['Nama kategori sudah dipakai.']);
  }
}

export async function createCategory(db: AppDb, input: CategoryInput): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new ValidationError(['Nama kategori wajib diisi.']);
  await assertNameFree(db, name, input.kind);
  const rows = await db
    .insert(categories)
    .values({
      name,
      icon: input.icon ?? (input.kind === 'expense' ? '💸' : '💰'),
      kind: input.kind,
    })
    .returning({ id: categories.id });
  return rows[0].id;
}

export interface CategoryPatch {
  name?: string;
  icon?: string;
}

export async function updateCategory(db: AppDb, id: number, patch: CategoryPatch): Promise<void> {
  const current = (await db.select().from(categories).where(eq(categories.id, id)).limit(1))[0];
  if (!current) throw new ValidationError(['Kategori tidak ditemukan.']);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new ValidationError(['Nama kategori wajib diisi.']);
    await assertNameFree(db, name, current.kind, id);
    patch = { ...patch, name };
  }
  await db.update(categories).set(patch).where(eq(categories.id, id));
}

export async function deleteCategory(db: AppDb, id: number): Promise<void> {
  const current = (await db.select().from(categories).where(eq(categories.id, id)).limit(1))[0];
  if (!current) throw new ValidationError(['Kategori tidak ditemukan.']);
  if (current.name === 'Lainnya' || current.name === 'Transfer') {
    throw new ValidationError(['Kategori bawaan tidak bisa dihapus.']);
  }
  await db.delete(categories).where(eq(categories.id, id));
}
