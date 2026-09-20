import { readdirSync, readFileSync } from 'node:fs';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from '../../db/schema.ts';
import type { AppDb } from '../seed.ts';

/** DB in-memory dari artefak migrasi drizzle yang sama dipakai device. */
export function makeDb(): { db: AppDb; close: () => void } {
  const sqlite = new Database(':memory:');
  const dir = new URL('../../drizzle/', import.meta.url);
  const files = readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  if (files.length === 0) throw new Error('Tidak ada file migrasi di drizzle/.');
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), 'utf8');
    for (const stmt of text.split('--> statement-breakpoint')) {
      if (stmt.trim()) sqlite.exec(stmt);
    }
  }
  const db = drizzle(sqlite, { schema }) as unknown as AppDb;
  return { db, close: () => sqlite.close() };
}
