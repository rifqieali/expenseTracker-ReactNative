import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { and, gte, lt, notInArray } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import { NON_SPEND_CATEGORIES } from '@/lib/pockets';
import { formatRp } from '@/lib/money';
import { breakdownByCategory, bucketMonthly, lastMonths } from '@/lib/stats';
import type { TxType } from '@/lib/money';
import Colors from '@/constants/Colors';

const BAR_MAX_H = 110;
const TAB_LABEL: Record<TxType, string> = { expense: 'Keluar', income: 'Masuk' };
const TAB_COLOR: Record<TxType, string> = { expense: Colors.light.error, income: Colors.light.success };

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

  // Live query without useMemo - let useLiveQuery handle reactivity
  const { data: rangeRows } = useLiveQuery(
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
  );
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
  const tabLabel = TAB_LABEL[tab];
  const tabColor = TAB_COLOR[tab];

  function shiftMonth(delta: number) {
    setOffset((o) => Math.max(0, o + delta));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Month Navigation */}
      <View style={styles.navCard}>
        <Pressable onPress={() => shiftMonth(1)} style={styles.navBtn}>
          <SymbolView name="chevron.left" size={20} tintColor={Colors.light.primary} />
        </Pressable>
        <Text style={styles.navLabel}>{selected.label}</Text>
        <Pressable onPress={() => shiftMonth(-1)} disabled={offset === 0} style={[styles.navBtn, offset === 0 && styles.navDisabled]}>
          <SymbolView name="chevron.right" size={20} tintColor={offset === 0 ? Colors.light.separator : Colors.light.primary} />
        </Pressable>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, styles.incomeBox]}>
          <View style={[styles.summaryIconWrap, { backgroundColor: '#E8F5E9' }]}>
            <SymbolView name="arrow.down.left" size={18} tintColor={Colors.light.success} />
          </View>
          <Text style={styles.summaryLabel}>Pemasukan</Text>
          <Text style={[styles.summaryValue, styles.incomeText]}>+{formatRp(selected.income)}</Text>
        </View>
        <View style={[styles.summaryBox, styles.expenseBox]}>
          <View style={[styles.summaryIconWrap, { backgroundColor: '#FEE2E2' }]}>
            <SymbolView name="arrow.up.right" size={18} tintColor={Colors.light.error} />
          </View>
          <Text style={styles.summaryLabel}>Pengeluaran</Text>
          <Text style={[styles.summaryValue, styles.expenseText]}>-{formatRp(selected.expense)}</Text>
        </View>
      </View>

      {/* Chart */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Grafik 6 Bulan</Text>
        {!hasAny ? (
          <Text style={styles.empty}>Belum ada data — catat transaksi dulu di tab Catat.</Text>
        ) : (
          <>
            <View style={styles.chart}>
              {points.map((p, i) => (
                <Pressable
                  key={p.key}
                  onPress={() => setOffset(offset + (points.length - 1 - i))}
                  style={[styles.col, i === points.length - 1 && styles.colActive]}>
                  <View style={styles.bars}>
                    <View style={[styles.bar, { backgroundColor: Colors.light.success }, { height: Math.max(2, (p.income / maxVal) * BAR_MAX_H) }]} />
                    <View style={[styles.bar, { backgroundColor: Colors.light.error }, { height: Math.max(2, (p.expense / maxVal) * BAR_MAX_H) }]} />
                  </View>
                  <Text style={styles.colLabel}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.light.success }]} />
                <Text style={styles.legendText}>Masuk</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.light.error }]} />
                <Text style={styles.legendText}>Keluar</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Category Breakdown */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Kategori · {selected.label}</Text>
        
        <View style={styles.toggleRow}>
          {(['expense', 'income'] as TxType[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.toggle, tab === t && styles.toggleActive]}>
              <Text style={[styles.toggleText, tab === t && styles.toggleTextActive]}>{TAB_LABEL[t]}</Text>
            </Pressable>
          ))}
        </View>

        {slices.length === 0 ? (
          <Text style={styles.empty}>Bulan ini belum ada transaksi {tabLabel.toLowerCase()}.</Text>
        ) : (
          <View style={styles.breakdownList}>
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
                      { backgroundColor: tabColor },
                      { width: `${Math.round(s.share * 100)}%` as const },
                    ]}
                  />
                </View>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total {tabLabel.toLowerCase()}</Text>
              <Text style={styles.totalValue}>{formatRp(totalTab)}</Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  
  // Month Navigation
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  navBtn: { 
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.light.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: { opacity: 0.4 },
  navLabel: { fontSize: 18, fontWeight: 'bold', color: Colors.light.text },
  
  // Summary
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryBox: { 
    flex: 1, 
    borderRadius: 16, 
    padding: 16, 
    backgroundColor: Colors.light.cardBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  incomeBox: {},
  expenseBox: {},
  summaryLabel: { fontSize: 13, color: Colors.light.secondaryText, marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: 'bold' },
  incomeText: { color: Colors.light.success },
  expenseText: { color: Colors.light.error },
  
  // Section Card
  sectionCard: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.light.text, marginBottom: 14 },
  
  // Chart
  chart: { 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    backgroundColor: Colors.light.surfaceVariant,
    borderRadius: 12,
    padding: 12,
  },
  col: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: 8 },
  colActive: { backgroundColor: Colors.light.cardBackground },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: BAR_MAX_H },
  bar: { width: 12, borderRadius: 4, minHeight: 2 },
  colLabel: { fontSize: 11, color: Colors.light.secondaryText, fontWeight: '500' },
  
  // Legend
  legend: { flexDirection: 'row', gap: 20, justifyContent: 'center', marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: Colors.light.secondaryText, fontWeight: '500' },
  
  // Toggle
  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  toggle: { 
    flex: 1, 
    padding: 12, 
    borderRadius: 12, 
    backgroundColor: Colors.light.surfaceVariant, 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.separator,
  },
  toggleActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  toggleText: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  toggleTextActive: { color: '#fff' },
  
  // Breakdown
  breakdownList: { gap: 14 },
  sliceRow: { gap: 6 },
  sliceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliceName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  sliceVal: { fontSize: 13, color: Colors.light.secondaryText },
  barBg: { height: 8, borderRadius: 4, backgroundColor: Colors.light.separator, overflow: 'hidden' },
  sliceFill: { height: 8, borderRadius: 4 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.separator,
    marginTop: 4,
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  totalValue: { fontSize: 16, fontWeight: 'bold', color: Colors.light.text },
  
  empty: { opacity: 0.6, fontSize: 14, padding: 20, textAlign: 'center', color: Colors.light.secondaryText },
});
