import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Kategori transaksi (seed bawaan, ikon emoji sederhana ala Jago). */
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  icon: text('icon').notNull().default('💸'),
  kind: text('kind', { enum: ['expense', 'income'] }).notNull().default('expense'),
});

/** Kantong ala Jago: pos dana dengan saldo + batas budget bulanan (0 = tanpa batas). */
export const pockets = sqliteTable('pockets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  icon: text('icon').notNull().default('💰'),
  color: text('color').notNull().default('#2F80ED'),
  balance: real('balance').notNull().default(0),
  budgetLimit: real('budget_limit').notNull().default(0),
});

/** Transaksi expense/income, selalu terikat ke satu kantong. */
export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pocketId: integer('pocket_id')
      .notNull()
      .references(() => pockets.id),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    amount: real('amount').notNull(),
    category: text('category').notNull().default('Lainnya'),
    note: text('note').notNull().default(''),
    // epoch ms, gampang di-index & di-range untuk ringkasan bulanan
    date: integer('date').notNull(),
  },
  (t) => [index('idx_tx_date').on(t.date), index('idx_tx_pocket').on(t.pocketId)],
);

export type Pocket = typeof pockets.$inferSelect;
export type NewPocket = typeof pockets.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Category = typeof categories.$inferSelect;
