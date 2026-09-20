import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { and, gte, lt, notInArray } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import { NON_SPEND_CATEGORIES } from '@/lib/pockets';
import { formatRp } from '@/lib/money';
import { breakdownByCategory, bucketMonthly, lastMonths } from '@/lib/stats';
import type { TxType } from '@/lib/money';

const BAR_MAX_H = 110;

/**
 * Stats bulanan (#6): grafik ringan pemasukan vs pengeluaran 6 bulan +
 * breakdown kategori bulan terpilih. Grafik digambar dari View murni
 * (tanpa library grafik) agar APK tetap ringan. Satu live query untuk
 * series + breakdown → keduanya selalu konsisten. Bulan kosong tampil
 * sebagai empty state, bukan crash.
 */
export default function StatsScreen() {
  const [offset, setOffset] = useState(0); // 0 = bulan berjalan, +1 = mundur sebulan
  const [tab, setTab] = useState<TxType>('expense');

  const selectedDate = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - offset, 1);
  }, [offset]);

  const months = useMemo(() => lastMonths(selectedDate, 6), [selectedDate]);

  const rangeQuery = useMemo(
    () =>
      db
        .select({
          type: transactions.type,
          amount: transactions.amount,
          date: transactions.date,
          category: transactions.category,
        })
        .from(transactions)
        .where(
          and(
            notInArray(transactions.category, [...NON_SPEND_CATEGORIES]),
            gte(transactions.date, months[0].start),
            lt(transactions.date, months[months.length - 1].end),
          ),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months[0].start, months[months.length - 1].end],
  );
  const { data: rangeRows } = useLiveQuery(rangeQuery);
  const rows = useMemo(() => rangeRows ?? [], [rangeRows]);

  const points = useMemo(() => bucketMonthly(rows, months), [rows, months]);
  const selected = points[points.length - 1];
  const hasAny = points.some((p) => p.income > 0 || p.expense > 0);
  const maxVal = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]));

  const breakdown = useMemo(() => {
    const inMonth = rows.filter((r) => r.date >= selected.start && r.date < selected.end);
    const expense = breakdownByCategory(inMonth.filter((r) => r.type === 'expense'));
    const income = breakdownByCategory(inMonth.filter((r) => r.type === 'income'));
    return { expense, income };
  }, [rows, selected.start, selected.end]);
  const slices = tab === 'expense' ? breakdown.expense : breakdown.income;
  const totalTab = tab === 'expense' ? selected.expense : selected.income;

  function shiftMonth(delta: number) {
    setOffset((o) => Math.max(0, o + delta));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.nav}>
        <Pressable onPress={() => shiftMonth(1)} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.navLabel}>{selected.label}</Text>
        <Pressable onPress={() => shiftMonth(-1)} disabled={offset === 0} style={[styles.navBtn, offset === 0 && styles.navDisabled]}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Masuk</Text>
          <Text style={[styles.summaryValue, styles.incomeText]}>+{formatRp(selected.income)}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Keluar</Text>
          <Text style={[styles.summaryValue, styles.expenseText]}>-{formatRp(selected.expense)}</Text>
        </View>
      </View>

      <Text style={styles.section}>6 bulan terakhir</Text>
      {!hasAny ? (
        <Text style={styles.empty}>Belum ada data — catat transaksi dulu di tab Catat.</Text>
      ) : (
        <View style={styles.chart}>
          {points.map((p, i) => (
            <Pressable
              key={p.key}
              onPress={() => setOffset(offset + (points.length - 1 - i))}
              style={[styles.col, i === points.length - 1 && styles.colActive]}>
              <View style={styles.bars}>
                <View style={[styles.bar, styles.incomeBar, { height: Math.max(2, (p.income / maxVal) * BAR_MAX_H) }]} />
                <View style={[styles.bar, styles.expenseBar, { height: Math.max(2, (p.expense / maxVal) * BAR_MAX_H) }]} />
              </View>
              <Text style={styles.colLabel}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.legend}>
        <Text style={styles.legendItem}><Text style={styles.dotIncome}>●</Text> Masuk</Text>
        <Text style={styles.legendItem}><Text style={styles.dotExpense}>●</Text> Keluar</Text>
      </View>

      <Text style={styles.section}>Kategori · {selected.label}</Text>
      <View style={styles.toggleRow}>
        {(['expense', 'income'] as TxType[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.toggle, tab === t && styles.toggleActive]}>
            <Text style={[styles.toggleText, tab === t && styles.toggleTextActive]}>
              {t === 'expense' ? 'Keluar' : 'Masuk'}
            </Text>
          </Pressable>
        ))}
      </View>
      {slices.length === 0 ? (
        <Text style={styles.empty}>Bulan ini belum ada transaksi {tab === 'expense' ? 'keluar' : 'masuk'}.</Text>
      ) : (
        <View style={styles.breakBox}>
          {slices.map((s) => (
            <View key={s.category} style={styles.sliceRow}>
              <View style={styles.sliceHead}>
                <Text style={styles.sliceName}>{s.category}</Text>
                <Text style={styles.sliceVal}>
                  {formatRp(s.total)} · {Math.round(s.share * 100)}%
                </Text>
              </View>
              <View style={styles.barBg}>
                <View
                  style={[
                    styles.sliceFill,
                    tab === 'expense' ? styles.expenseBar : styles.incomeBar,
                    { width: `${Math.round(s.share * 100)}%` as const },
                  ]}
                />
              </View>
            </View>
          ))}
          <Text style={styles.totalLine}>
            Total {tab === 'expense' ? 'keluar' : 'masuk'}: {formatRp(totalTab)}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  navDisabled: { opacity: 0.4 },
  navText: { fontSize: 22, fontWeight: 'bold' },
  navLabel: { fontSize: 19, fontWeight: 'bold' },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryBox: { flex: 1, borderRadius: 14, padding: 14, gap: 2, backgroundColor: '#fff', elevation: 1 },
  summaryLabel: { fontSize: 12, opacity: 0.7 },
  summaryValue: { fontSize: 17, fontWeight: 'bold' },
  incomeText: { color: '#27AE60' },
  expenseText: { color: '#EB5757' },
  section: { fontSize: 17, fontWeight: 'bold', marginTop: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#fff', borderRadius: 14, padding: 12, elevation: 1 },
  col: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4, borderRadius: 8 },
  colActive: { backgroundColor: '#EBF3FE' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: BAR_MAX_H },
  bar: { width: 10, borderRadius: 3, minHeight: 2 },
  incomeBar: { backgroundColor: '#27AE60' },
  expenseBar: { backgroundColor: '#EB5757' },
  colLabel: { fontSize: 10, opacity: 0.7 },
  legend: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  legendItem: { fontSize: 12, opacity: 0.8 },
  dotIncome: { color: '#27AE60' },
  dotExpense: { color: '#EB5757' },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggle: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  toggleActive: { backgroundColor: '#2F80ED' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#333' },
  toggleTextActive: { color: '#fff' },
  breakBox: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10, elevation: 1 },
  sliceRow: { gap: 4 },
  sliceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliceName: { fontSize: 14, fontWeight: '600' },
  sliceVal: { fontSize: 13, opacity: 0.75 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: '#eee', overflow: 'hidden' },
  sliceFill: { height: 8, borderRadius: 4 },
  totalLine: { fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  empty: { opacity: 0.6, fontSize: 14, padding: 8, textAlign: 'center' },
});
