import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { and, desc, gte, lt, notInArray } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { pockets, transactions } from '@/db/schema';
import {
  budgetProgress,
  expenseUsageByPocket,
  remainingBudget,
  summarizeMonthRows,
  totalBalanceOf,
} from '@/lib/dashboard';
import { NON_SPEND_CATEGORIES } from '@/lib/pockets';
import { formatRp, monthRange } from '@/lib/money';

/**
 * Dashboard home (#5): total saldo + ringkasan bulan + kantong horizontal
 * + 10 transaksi terakhir. Semua via live query → transaksi baru dari
 * QuickCreate muncul tanpa restart. Agregat berat diuji di lib/dashboard.ts;
 * di sini hanya agregat ringan atas hasil live query (maks 10 + N kantong).
 */
export default function HomeScreen() {
  const { data: pocketRows } = useLiveQuery(db.select().from(pockets));
  const list = useMemo(() => pocketRows ?? [], [pocketRows]);
  const pocketById = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);

  const monthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}`;
  }, []);

  const monthQuery = useMemo(() => {
    const { start, end } = monthRange();
    return db
      .select({ type: transactions.type, amount: transactions.amount, pocketId: transactions.pocketId })
      .from(transactions)
      .where(
        and(
          notInArray(transactions.category, [...NON_SPEND_CATEGORIES]), // pindah dana bukan income/expense riil
          gte(transactions.date, start),
          lt(transactions.date, end),
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  const recentQuery = useMemo(
    () => db.select().from(transactions).orderBy(desc(transactions.date), desc(transactions.id)).limit(10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey],
  );

  const { data: monthRows } = useLiveQuery(monthQuery);
  const { data: recentRows } = useLiveQuery(recentQuery);

  const total = useMemo(() => totalBalanceOf(list), [list]);

  const { income, expense } = useMemo(() => summarizeMonthRows(monthRows ?? []), [monthRows]);

  const usage = useMemo(() => expenseUsageByPocket(monthRows ?? []), [monthRows]);

  const recent = useMemo(() => recentRows ?? [], [recentRows]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.saldoCard}>
        <Text style={styles.saldoLabel}>Total saldo</Text>
        <Text style={styles.saldoValue}>{formatRp(total)}</Text>
        <Text style={styles.saldoSub}>{list.length} kantong</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, styles.incomeBox]}>
          <Text style={styles.summaryLabel}>Masuk bulan ini</Text>
          <Text style={[styles.summaryValue, styles.incomeText]}>+{formatRp(income)}</Text>
        </View>
        <View style={[styles.summaryBox, styles.expenseBox]}>
          <Text style={styles.summaryLabel}>Keluar bulan ini</Text>
          <Text style={[styles.summaryValue, styles.expenseText]}>-{formatRp(expense)}</Text>
        </View>
      </View>

      <Text style={styles.section}>Kantong</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pocketStrip}>
        {list.length === 0 && <Text style={styles.empty}>Belum ada kantong.</Text>}
        {list.map((p) => {
          const used = usage.get(p.id) ?? 0;
          const progress = budgetProgress(p.budgetLimit, used);
          return (
            <View key={p.id} style={styles.pocketCard}>
              <Text style={styles.pocketIcon}>{p.icon}</Text>
              <Text style={styles.pocketName}>{p.name}</Text>
              <Text style={styles.pocketBalance}>{formatRp(p.balance)}</Text>
              {p.budgetLimit > 0 ? (
                <View style={styles.budgetWrap}>
                  <View style={styles.barBg}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.round(progress * 100)}%` as const,
                          backgroundColor: progress >= 1 ? '#EB5757' : p.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barText}>
                    Sisa {formatRp(remainingBudget(p.budgetLimit, used) ?? 0)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.barText}>Tanpa budget</Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Text style={styles.section}>Terakhir</Text>
      <View style={styles.recentBox}>
        {recent.length === 0 && <Text style={styles.empty}>Belum ada transaksi.</Text>}
        {recent.map((t) => {
          const pocket = pocketById.get(t.pocketId);
          const isIncome = t.type === 'income';
          return (
            <View key={t.id} style={styles.txRow}>
              <View style={styles.txLeft}>
                <Text style={styles.txCategory}>
                  {t.category}
                  {t.note ? ` · ${t.note}` : ''}
                </Text>
                <Text style={styles.txMeta}>
                  {pocket ? `${pocket.icon} ${pocket.name}` : '—'} ·{' '}
                  {new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <Text style={[styles.txAmount, isIncome ? styles.incomeText : styles.expenseText]}>
                {isIncome ? '+' : '-'}{formatRp(t.amount)}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  saldoCard: { backgroundColor: '#2F80ED', borderRadius: 16, padding: 18, gap: 2 },
  saldoLabel: { color: '#fff', opacity: 0.8, fontSize: 14 },
  saldoValue: { color: '#fff', fontSize: 30, fontWeight: 'bold' },
  saldoSub: { color: '#fff', opacity: 0.8, fontSize: 13 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryBox: { flex: 1, borderRadius: 14, padding: 14, gap: 2, backgroundColor: '#fff', elevation: 1 },
  incomeBox: { borderLeftWidth: 4, borderLeftColor: '#27AE60' },
  expenseBox: { borderLeftWidth: 4, borderLeftColor: '#EB5757' },
  summaryLabel: { fontSize: 12, opacity: 0.7 },
  summaryValue: { fontSize: 17, fontWeight: 'bold' },
  incomeText: { color: '#27AE60' },
  expenseText: { color: '#EB5757' },
  section: { fontSize: 17, fontWeight: 'bold', marginTop: 4 },
  pocketStrip: { gap: 10, paddingRight: 8 },
  pocketCard: { width: 150, backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 2, elevation: 1 },
  pocketIcon: { fontSize: 26 },
  pocketName: { fontSize: 14, fontWeight: 'bold' },
  pocketBalance: { fontSize: 14, opacity: 0.85 },
  budgetWrap: { gap: 3, marginTop: 4 },
  barBg: { height: 7, borderRadius: 4, backgroundColor: '#eee', overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4 },
  barText: { fontSize: 11, opacity: 0.7 },
  recentBox: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, elevation: 1 },
  txRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee', gap: 10 },
  txLeft: { flex: 1, gap: 1 },
  txCategory: { fontSize: 14, fontWeight: '600' },
  txMeta: { fontSize: 12, opacity: 0.6 },
  txAmount: { fontSize: 14, fontWeight: 'bold' },
  empty: { opacity: 0.6, fontSize: 14, padding: 8 },
});
