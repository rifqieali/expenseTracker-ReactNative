import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { and, desc, gte, lt, notInArray } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { pockets, transactions } from '@/db/schema';
import type { Transaction } from '@/db/schema';
import {
  budgetProgress,
  expenseUsageByPocket,
  remainingBudget,
  summarizeMonthRows,
  totalBalanceOf,
} from '@/lib/dashboard';
import { deleteTransaction } from '@/lib/ledger';
import { ValidationError } from '@/lib/errors';
import { NON_SPEND_CATEGORIES } from '@/lib/pockets';
import { formatRp, monthRange } from '@/lib/money';
import Colors from '@/constants/Colors';

export default function HomeScreen() {
  const router = useRouter();
  const { data: pocketRows } = useLiveQuery(db.select().from(pockets));
  const list = useMemo(() => pocketRows ?? [], [pocketRows]);
  const pocketById = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);

  // Live queries without useMemo - let useLiveQuery handle reactivity
  const { start, end } = monthRange();

  const { data: monthRows } = useLiveQuery(
    db
      .select({ type: transactions.type, amount: transactions.amount, pocketId: transactions.pocketId })
      .from(transactions)
      .where(
        and(
          notInArray(transactions.category, [...NON_SPEND_CATEGORIES]),
          gte(transactions.date, start),
          lt(transactions.date, end),
        ),
      ),
  );

  const { data: recentRows } = useLiveQuery(
    db.select().from(transactions).orderBy(desc(transactions.date), desc(transactions.id)).limit(10),
  );

  const total = useMemo(() => totalBalanceOf(list), [list]);
  const { income, expense } = useMemo(() => summarizeMonthRows(monthRows ?? []), [monthRows]);
  const usage = useMemo(() => expenseUsageByPocket(monthRows ?? []), [monthRows]);
  const recent = useMemo(() => recentRows ?? [], [recentRows]);

  function handleTransactionAction(tx: Transaction) {
    if (tx.category === 'Transfer') {
      Alert.alert('Transfer', 'Transaksi transfer tidak bisa diedit atau dihapus.');
      return;
    }
    Alert.alert(
      'Transaksi',
      `${tx.category}${tx.note ? ` - ${tx.note}` : ''}\n${formatRp(tx.amount)}`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: () => handleDelete(tx) },
      ],
    );
  }

  async function handleDelete(tx: Transaction) {
    Alert.alert('Hapus Transaksi?', `${tx.category} ${formatRp(tx.amount)}`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(db, tx.id);
          } catch (e) {
            Alert.alert('Gagal', e instanceof ValidationError ? e.errors.join(' ') : 'Gagal menghapus transaksi.');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={['#2196F3', '#1976D2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}>
        <Text style={styles.greeting}>Selamat datang!</Text>
        <Text style={styles.headerTitle}>Total Saldo</Text>
        <Text style={styles.headerBalance}>{formatRp(total)}</Text>
        <Text style={styles.headerSub}>{list.length} kantong aktif</Text>
      </LinearGradient>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, styles.incomeBox]}>
          <View style={styles.summaryIconWrap}>
            <SymbolView name="arrow.down.left" size={16} tintColor={Colors.light.success} />
          </View>
          <Text style={styles.summaryLabel}>Pemasukan</Text>
          <Text style={[styles.summaryValue, styles.incomeText]}>+{formatRp(income)}</Text>
        </View>
        <View style={[styles.summaryBox, styles.expenseBox]}>
          <View style={[styles.summaryIconWrap, { backgroundColor: '#FEE2E2' }]}>
            <SymbolView name="arrow.up.right" size={16} tintColor={Colors.light.error} />
          </View>
          <Text style={styles.summaryLabel}>Pengeluaran</Text>
          <Text style={[styles.summaryValue, styles.expenseText]}>-{formatRp(expense)}</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.section}>Kantong</Text>
        <Pressable onPress={() => router.push('/pockets')}>
          <Text style={styles.seeAll}>Lihat Semua</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pocketStrip}>
        {list.length === 0 && <Text style={styles.empty}>Belum ada kantong.</Text>}
        {list.map((p) => {
          const used = usage.get(p.id) ?? 0;
          const progress = budgetProgress(p.budgetLimit, used);
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/pocket/${p.id}`)}
              style={styles.pocketCard}>
              <View style={[styles.pocketIconWrap, { backgroundColor: p.color + '20' }]}>
                <SymbolView name={p.icon as any} size={22} tintColor={p.color} />
              </View>
              <Text style={styles.pocketName}>{p.name}</Text>
              <Text style={styles.pocketBalance}>{formatRp(p.balance)}</Text>
              {p.budgetLimit > 0 && (
                <View style={styles.budgetWrap}>
                  <View style={styles.barBg}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.round(progress * 100)}%` as const,
                          backgroundColor: progress >= 1 ? Colors.light.error : p.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barText}>
                    Sisa {formatRp(remainingBudget(p.budgetLimit, used) ?? 0)}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.section}>Transaksi Terakhir</Text>
      </View>
      <View style={styles.recentBox}>
        {recent.length === 0 && <Text style={styles.empty}>Belum ada transaksi.</Text>}
        {recent.map((t) => {
          const pocket = pocketById.get(t.pocketId);
          const isIncome = t.type === 'income';
          return (
            <Pressable
              key={t.id}
              onPress={() => handleTransactionAction(t)}
              style={styles.txRow}>
              <View style={[styles.txIconWrap, { backgroundColor: isIncome ? '#E8F5E2' : '#FEE2E2' }]}>
                <SymbolView
                  name={isIncome ? 'arrow.down.left' : 'arrow.up.right'}
                  size={18}
                  tintColor={isIncome ? Colors.light.success : Colors.light.error}
                />
              </View>
              <View style={styles.txLeft}>
                <Text style={styles.txCategory}>{t.category}</Text>
                <Text style={styles.txMeta}>
                  {pocket ? pocket.name : '—'} ·{' '}
                  {new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <Text style={[styles.txAmount, isIncome ? styles.incomeText : styles.expenseText]}>
                {isIncome ? '+' : '-'}{formatRp(t.amount)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { paddingBottom: 32 },

  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  greeting: { color: '#ffffff', opacity: 0.8, fontSize: 14, marginBottom: 4 },
  headerTitle: { color: '#ffffff', opacity: 0.9, fontSize: 14, marginTop: 8 },
  headerBalance: { color: '#ffffff', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  headerSub: { color: '#ffffff', opacity: 0.7, fontSize: 13, marginTop: 4 },

  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
  },
  summaryBox: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    backgroundColor: Colors.light.cardBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  incomeBox: {},
  expenseBox: {},
  summaryLabel: { fontSize: 12, color: Colors.light.secondaryText, marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: 'bold' },
  incomeText: { color: Colors.light.success },
  expenseText: { color: Colors.light.error },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  section: { fontSize: 16, fontWeight: 'bold', color: Colors.light.text },
  seeAll: { fontSize: 13, color: Colors.light.primary, fontWeight: '500' },

  pocketStrip: { gap: 12, paddingHorizontal: 20, paddingBottom: 20 },
  pocketCard: {
    width: 140,
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  pocketIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pocketName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  pocketBalance: { fontSize: 15, fontWeight: 'bold', color: Colors.light.text },
  budgetWrap: { gap: 4, marginTop: 4 },
  barBg: { height: 6, borderRadius: 3, backgroundColor: Colors.light.separator, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barText: { fontSize: 11, color: Colors.light.secondaryText },

  recentBox: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 16,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.separator,
    gap: 12,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txLeft: { flex: 1, gap: 2 },
  txCategory: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  txMeta: { fontSize: 12, color: Colors.light.secondaryText },
  txAmount: { fontSize: 15, fontWeight: 'bold' },
  empty: { opacity: 0.6, fontSize: 14, padding: 20, color: Colors.light.secondaryText, textAlign: 'center' },
});
