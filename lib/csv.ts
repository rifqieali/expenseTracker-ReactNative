import { Paths, File, Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { db } from '@/db/client';
import { transactions, pockets, categories } from '@/db/schema';
import type { Transaction, Pocket, Category } from '@/db/schema';
import { eq } from 'drizzle-orm';

// CSV Headers
const TX_HEADERS = ['id', 'pocketId', 'type', 'amount', 'category', 'note', 'date'];
const POCKET_HEADERS = ['id', 'name', 'icon', 'color', 'balance', 'budgetLimit'];
const CATEGORY_HEADERS = ['id', 'name', 'icon', 'kind'];

function escapeCsvField(field: string | number): string {
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

function toCsv<T extends Record<string, any>>(headers: string[], rows: T[]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h])).join(','));
  }
  return lines.join('\n');
}

function fromCsv<T>(headers: string[], csv: string): T[] {
  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const dataLines = lines.slice(1); // skip header
  return dataLines.map((line) => {
    const values = parseCsvLine(line);
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? '';
    });
    return obj as T;
  });
}

async function writeAndShare(filename: string, content: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Ekspor Data' });
}

// ========== EXPORT ==========

export async function exportTransactions(): Promise<void> {
  const rows = await db.select().from(transactions);
  const csv = toCsv(TX_HEADERS, rows);
  await writeAndShare('transactions_export.csv', csv);
}

export async function exportPockets(): Promise<void> {
  const rows = await db.select().from(pockets);
  const csv = toCsv(POCKET_HEADERS, rows);
  await writeAndShare('pockets_export.csv', csv);
}

export async function exportCategories(): Promise<void> {
  const rows = await db.select().from(categories);
  const csv = toCsv(CATEGORY_HEADERS, rows);
  await writeAndShare('categories_export.csv', csv);
}

export async function exportAll(): Promise<void> {
  const txRows = await db.select().from(transactions);
  const pocketRows = await db.select().from(pockets);
  const catRows = await db.select().from(categories);

  const txCsv = toCsv(TX_HEADERS, txRows);
  const pocketCsv = toCsv(POCKET_HEADERS, pocketRows);
  const catCsv = toCsv(CATEGORY_HEADERS, catRows);

  const combined = [
    '=== TRANSAKSI ===',
    txCsv,
    '',
    '=== KANTONG ===',
    pocketCsv,
    '',
    '=== KATEGORI ===',
    catCsv,
  ].join('\n');

  await writeAndShare('expensetracker_full_export.csv', combined);
}

// ========== IMPORT ==========

async function readImportFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'text/csv',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const file = new File(result.assets[0].uri);
  return await file.text();
}

export async function importTransactions(): Promise<number> {
  const content = await readImportFile();
  if (!content) return 0;

  const rows = fromCsv<Transaction>(TX_HEADERS, content);
  let imported = 0;

  for (const row of rows) {
    try {
      const pocketId = Number(row.pocketId);
      const amount = Number(row.amount);
      const date = Number(row.date);

      if (!pocketId || !amount || !date) continue;

      const pocket = await db.select().from(pockets).where(eq(pockets.id, pocketId)).limit(1);
      if (pocket.length === 0) continue;

      await db.insert(transactions).values({
        pocketId,
        type: (row.type === 'income' ? 'income' : 'expense') as 'expense' | 'income',
        amount,
        category: String(row.category || 'Lainnya'),
        note: String(row.note || ''),
        date,
      });
      imported++;
    } catch {
      // Skip invalid rows
    }
  }

  return imported;
}

export async function importPockets(): Promise<number> {
  const content = await readImportFile();
  if (!content) return 0;

  const rows = fromCsv<Pocket>(POCKET_HEADERS, content);
  let imported = 0;

  for (const row of rows) {
    try {
      const name = String(row.name).trim();
      if (!name) continue;

      const existing = await db.select().from(pockets).where(eq(pockets.name, name)).limit(1);
      if (existing.length > 0) continue;

      await db.insert(pockets).values({
        name,
        icon: String(row.icon || '💰'),
        color: String(row.color || '#2F80ED'),
        balance: Number(row.balance) || 0,
        budgetLimit: Number(row.budgetLimit) || 0,
      });
      imported++;
    } catch {
      // Skip invalid rows
    }
  }

  return imported;
}

export async function importCategories(): Promise<number> {
  const content = await readImportFile();
  if (!content) return 0;

  const rows = fromCsv<Category>(CATEGORY_HEADERS, content);
  let imported = 0;

  for (const row of rows) {
    try {
      const name = String(row.name).trim();
      if (!name) continue;

      const existing = await db.select().from(categories).where(eq(categories.name, name)).limit(1);
      if (existing.length > 0) continue;

      await db.insert(categories).values({
        name,
        icon: String(row.icon || '💸'),
        kind: (row.kind === 'income' ? 'income' : 'expense') as 'expense' | 'income',
      });
      imported++;
    } catch {
      // Skip invalid rows
    }
  }

  return imported;
}
