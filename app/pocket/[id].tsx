import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { and, desc, eq, gte, lt, notInArray } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { pockets, transactions } from '@/db/schema';
import type { Transaction } from '@/db/schema';
import { NON_SPEND_CATEGORIES } from '@/lib/pockets';
import { budgetProgress, remainingBudget } from '@/lib/dashboard';
import { formatRp, monthRange } from '@/lib/money';
import { deleteTransaction } from '@/lib/ledger';
import { ValidationError } from '@/lib/errors';
import Colors from '@/constants/Colors';

export default function PocketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const pocketId = Number(id);

  const { data: pocketRows } = useLiveQuery(
    db.select().from(pockets).where(eq(pockets.id, pocketId)),
  );
  const pocket = pocketRows?.[0];

  const monthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}`;
  }, []);

  const { start, end } = monthRange();

  const { data: monthRows } = useLiveQuery(
    db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(
        and(
          eq(transactions.pocketId, pocketId),
          eq(transactions.type, 'expense'),
          notInArray(transactions.category, [...NON_SPEND_CATEGORIES]),
          gte(transactions.date, start),
          lt(transactions.date, end),
        ),
      ),
  );

  const used = useMemo(() => (monthRows ?? []).reduce((s, r) => s + r.amount, 0), [monthRows]);

  const txQuery = useMemo(
    () =>
      db
        .select()
        .from(transactions)
        .where(eq(transactions.pocketId, pocketId))
        .orderBy(desc(transactions.date), desc(transactions.id)),
    [pocketId],
  );
  const { data: txRows } = useLiveQuery(txQuery);
  const txList = useMemo(() => txRows ?? [], [txRows]);

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
            Alert.alert('Gagal', e instanceof ValidationError ? e.errors.join(' ') : 'Gagal menghapus.');
          }
        },
      },
    ]);
  }

  if (!pocket) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Kantong tidak ditemukan.</Text>
      </View>
    );
  }

  const progress = budgetProgress(pocket.budgetLimit, used);
  const isIncome = (tx: Transaction) => tx.type === 'income';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Pocket Header */}
      <View style={[styles.headerCard, { backgroundColor: pocket.color }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <SymbolView name="chevron.left" size={20} tintColor="#ffffff" />
        </Pressable>
        <View style={styles.headerIconWrap}>
          <SymbolView name={pocket.icon as any} size={32} tintColor="#ffffff" />
        </View>
        <Text style={styles.headerName}>{pocket.name}</Text>
        <Text style={styles.headerBalance}>{formatRp(pocket.balance)}</Text>
        {pocket.budgetLimit > 0 && (
          <View style={styles.budgetSection}>
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.round(progress * 100)}%` as const,
                    backgroundColor: progress >= 1 ? '#ff6b6b' : '#ffffff',
                  },
                ]}
              />
            </View>
            <Text style={styles.barText}>
              Terpakai {formatRp(used)} / {formatRp(pocket.budgetLimit)}
            </Text>
          </View>
        )}
      </View>

      {/* Transactions */}
      <Text style={styles.sectionTitle}>Riwayat Transaksi</Text>
      <View style={styles.txBox}>
        {txList.length === 0 && <Text style={styles.empty}>Belum ada transaksi.</Text>}
        {txList.map((tx) => {
          const inc = isIncome(tx);
          return (
            <Pressable key={tx.id} onPress={() => handleTransactionAction(tx)} style={styles.txRow}>
              <View style={[styles.txIconWrap, { backgroundColor: inc ? '#E8F5E2' : '#FEE2E2' }]}>
                <SymbolView
                  name={inc ? 'arrow.down.left' : 'arrow.up.right'}
                  size={18}
                  tintColor={inc ? Colors.light.success : Colors.light.error}
                />
              </View>
              <View style={styles.txLeft}>
                <Text style={styles.txCategory}>{tx.category}</Text>
                <Text style={styles.txMeta}>
                  {tx.note ? `${tx.note} · ` : ''}
                  {new Date(tx.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <Text style={[styles.txAmount, inc ? styles.incomeText : styles.expenseText]}>
                {inc ? '+' : '-'}{formatRp(tx.amount)}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerCard: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
  },
  backBtn: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerName: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  headerBalance: { color: '#ffffff', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  budgetSection: { width: '100%', marginTop: 16, gap: 6 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barText: { color: '#ffffff', opacity: 0.9, fontSize: 12 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.light.text,
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 12,
  },

  txBox: {
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
  incomeText: { color: Colors.light.success },
  expenseText: { color: Colors.light.error },
  empty: { opacity: 0.6, fontSize: 14, padding: 20, color: Colors.light.secondaryText, textAlign: 'center' },
});
