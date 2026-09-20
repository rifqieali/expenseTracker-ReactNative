/** Pure money/validation logic — no DB, no native modules. Fully unit-testable. */

export type TxType = 'expense' | 'income';

export interface TxInput {
  pocketId: number | null;
  type: TxType;
  amount: number | null;
}

export interface TransferInput {
  fromId: number | null;
  toId: number | null;
  amount: number | null;
}

/**
 * Parse input nominal ala Indonesia: "15000", "15.000", "15.000,50".
 * @returns number finite, or null bila tidak bisa diparse.
 */
export function parseAmountId(input: string): number | null {
  const s = input.trim().replace(/\s/g, '');
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  let normalized: string;
  if (s.includes(',')) {
    const [intPart, ...decParts] = s.split(',');
    if (decParts.length > 1 || intPart === '') return null;
    if (!/^[\d.]*$/.test(intPart) || !/^\d*$/.test(decParts[0])) return null;
    normalized = `${intPart.replace(/\./g, '')}.${decParts[0]}`;
  } else {
    normalized = s.replace(/\./g, '');
  }
  if (normalized === '' || normalized === '.') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Saldo baru setelah transaksi. Expense mengurangi, income menambah. */
export function nextBalance(current: number, type: TxType, amount: number): number {
  return type === 'expense' ? current - amount : current + amount;
}

/** Validasi input transaksi. @returns daftar pesan error Bahasa Indonesia (kosong = valid). */
export function validateTransaction(input: TxInput): string[] {
  const errors: string[] = [];
  if (input.pocketId == null) errors.push('Pilih kantong dulu.');
  if (input.amount == null || !Number.isFinite(input.amount)) {
    errors.push('Nominal tidak valid.');
  } else if (input.amount <= 0) {
    errors.push('Nominal harus lebih dari 0.');
  }
  return errors;
}

/** Validasi pindah dana. @returns daftar pesan error Bahasa Indonesia (kosong = valid). */
export function validateTransfer(input: TransferInput): string[] {
  const errors: string[] = [];
  if (input.fromId == null || input.toId == null) errors.push('Pilih kantong asal dan tujuan.');
  else if (input.fromId === input.toId) errors.push('Kantong asal dan tujuan harus beda.');
  if (input.amount == null || !Number.isFinite(input.amount)) {
    errors.push('Nominal tidak valid.');
  } else if (input.amount <= 0) {
    errors.push('Nominal harus lebih dari 0.');
  }
  return errors;
}

/** Format angka ke "Rp15.000". */
export function formatRp(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

/** Batas epoch-ms bulan berjalan untuk agregat budget. */
export function monthRange(now: Date = new Date()): { start: number; end: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return { start, end };
}
