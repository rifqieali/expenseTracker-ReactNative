import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import { seedIfEmpty } from '../lib/seed';
import * as schema from './schema';

const DB_NAME = 'expense.db';

const expoDb = openDatabaseSync(DB_NAME);

export const db: ExpoSQLiteDatabase<typeof schema> = drizzle(expoDb, { schema });

export { seedIfEmpty };
