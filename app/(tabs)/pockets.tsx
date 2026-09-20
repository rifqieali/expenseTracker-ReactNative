import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { FlashList } from '@shopify/flash-list';
import { and, eq, gte, lt, ne } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { pockets, transactions } from '@/db/schema';
import type { Pocket } from '@/db/schema';
import { ValidationError, transferFunds } from '@/lib/ledger';
import { createPocket, deletePocket, updatePocket } from '@/lib/pockets';
import { formatRp, monthRange, parseAmountId } from '@/lib/money';
import Colors from '@/constants/Colors';

const ICONS = ['wallet.pass.fill', 'house.fill', 'fork.knife', 'banknotes', 'airplane', 'gamecontroller.fill', 'pills.fill', 'book.fill'];
const COLORS = ['#2F80ED', '#F2994A', '#27AE60', '#EB5757', '#9B51E0', '#333333'];

/** Halaman Kantong ala Jago: CRUD + budget bar + pindah dana. */
export default function PocketsScreen() {
  const { data: pocketRows } = useLiveQuery(db.select().from(pockets));
  const list = useMemo(() => pocketRows ?? [], [pocketRows]);

  const monthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}`;
  }, []);
  const monthQuery = useMemo(() => {
    const { start, end } = monthRange();
    return db
      .select({ pocketId: transactions.pocketId, amount: transactions.amount })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'expense'),
          ne(transactions.category, 'Transfer'), // pindah dana bukan belanja
          gte(transactions.date, start),
          lt(transactions.date, end),
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);
  const { data: monthRows } = useLiveQuery(monthQuery);
  const usage = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of monthRows ?? []) map.set(r.pocketId, (map.get(r.pocketId) ?? 0) + r.amount);
    return map;
  }, [monthRows]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Pocket | null>(null);
  const [transferFrom, setTransferFrom] = useState<Pocket | null>(null);

  async function onDelete(p: Pocket) {
    Alert.alert('Hapus kantong?', `Hapus "${p.name}" dari daftar kantong?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePocket(db, p.id);
          } catch (e) {
            Alert.alert('Tidak bisa dihapus', e instanceof ValidationError ? e.errors.join(' ') : 'Gagal.');
          }
        },
      },
    ]);
  }

function renderItem({ item }: { item: Pocket }) {
    const used = usage.get(item.id) ?? 0;
    const progress = item.budgetLimit > 0 ? Math.min(used / item.budgetLimit, 1) : 0;
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.cardIconWrap, { backgroundColor: item.color + '20' }]}>
            <SymbolView name={item.icon as any} size={24} tintColor={item.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardBalance}>{formatRp(item.balance)}</Text>
          </View>
        </View>
        {item.budgetLimit > 0 && (
          <View style={styles.budgetSection}>
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.round(progress * 100)}%` as const, backgroundColor: progress >= 1 ? Colors.light.error : item.color },
                ]}
              />
            </View>
            <Text style={styles.barText}>
              {formatRp(used)} / {formatRp(item.budgetLimit)}
            </Text>
          </View>
        )}
        <View style={styles.actions}>
          <Pressable onPress={() => { setEditing(item); setFormOpen(true); }} style={[styles.actionBtn, styles.editBtn]}>
            <SymbolView name="pencil" size={14} tintColor={Colors.light.primary} />
            <Text style={styles.actionText}>Ubah</Text>
          </Pressable>
          {list.length > 1 && (
            <Pressable onPress={() => setTransferFrom(item)} style={[styles.actionBtn, styles.transferBtn]}>
              <SymbolView name="arrow.right.arrow.left" size={14} tintColor={Colors.light.primary} />
              <Text style={styles.actionText}>Pindah</Text>
            </Pressable>
          )}
          <Pressable onPress={() => onDelete(item)} style={[styles.actionBtn, styles.deleteBtn]}>
            <SymbolView name="trash" size={14} tintColor={Colors.light.error} />
            <Text style={[styles.actionText, styles.danger]}>Hapus</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Kantong</Text>
        <Pressable
          onPress={() => { setEditing(null); setFormOpen(true); }}
          style={styles.addBtn}>
          <SymbolView name="plus.circle.fill" size={18} tintColor="#ffffff" />
          <Text style={styles.addText}>Tambah</Text>
        </Pressable>
      </View>
      <FlashList
        data={list}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada kantong.</Text>}
      />
      <PocketForm
        visible={formOpen}
        editing={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
      />
      {transferFrom && (
        <TransferForm from={transferFrom} pockets={list} onClose={() => setTransferFrom(null)} />
      )}
    </View>
  );
}

function PocketForm({ visible, editing, onClose }: { visible: boolean; editing: Pocket | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [budgetText, setBudgetText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Prefill tiap kali modal dibuka (atau target edit berganti).
  const formKey = editing ? `e:${editing.id}` : 'new';
  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setIcon(editing?.icon ?? ICONS[0]);
    setColor(editing?.color ?? COLORS[0]);
    setBudgetText(editing && editing.budgetLimit > 0 ? String(editing.budgetLimit) : '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, formKey]);

  async function onSave() {
    setError(null);
    const budget = budgetText.trim() === '' ? 0 : parseAmountId(budgetText);
    if (budget == null) {
      setError('Budget tidak valid.');
      return;
    }
    try {
      if (editing) {
        await updatePocket(db, editing.id, { name, icon, color, budgetLimit: budget });
      } else {
        await createPocket(db, { name, icon, color, budgetLimit: budget });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ValidationError ? e.errors.join(' ') : 'Gagal menyimpan.');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{editing ? 'Ubah Kantong' : 'Kantong Baru'}</Text>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Nama</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="cth. Darurat" placeholderTextColor={Colors.light.secondaryText} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Ikon</Text>
          <View style={styles.chips}>
            {ICONS.map((i) => (
              <Pressable key={i} onPress={() => setIcon(i)} style={[styles.chip, icon === i && styles.chipActive]}>
                <SymbolView name={i as any} size={20} tintColor={icon === i ? '#ffffff' : Colors.light.text} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Warna</Text>
          <View style={styles.chips}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorActive]}
              />
            ))}
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Budget Bulanan (0 = tanpa batas)</Text>
          <TextInput
            style={styles.input}
            value={budgetText}
            onChangeText={setBudgetText}
            placeholder="0"
            placeholderTextColor={Colors.light.secondaryText}
            keyboardType="decimal-pad"
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.sheetActions}>
          <Pressable onPress={onClose} style={[styles.save, styles.cancel]}>
            <Text style={styles.cancelText}>Batal</Text>
          </Pressable>
          <Pressable onPress={onSave} style={styles.save}>
            <SymbolView name="checkmark.circle.fill" size={18} tintColor="#ffffff" />
            <Text style={styles.saveText}>Simpan</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function TransferForm({ from, pockets: all, onClose }: { from: Pocket; pockets: Pocket[]; onClose: () => void }) {
  const targets = all.filter((p) => p.id !== from.id);
  const [toId, setToId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fallback selalu ke target valid pertama bila pilihan basi/kosong.
  const effectiveToId = targets.some((p) => p.id === toId) ? toId : (targets[0]?.id ?? null);

  async function onSend() {
    setError(null);
    try {
      await transferFunds(db, { fromId: from.id, toId: effectiveToId, amount: parseAmountId(amountText) });
      onClose();
    } catch (e) {
      setError(e instanceof ValidationError ? e.errors.join(' ') : 'Gagal memindah.');
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>
          Pindah dari {from.name}
        </Text>
        <Text style={styles.sheetSubtitle}>Saldo: {formatRp(from.balance)}</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Ke Kantong</Text>
          <View style={styles.chips}>
            {targets.map((p) => (
              <Pressable key={p.id} onPress={() => setToId(p.id)} style={[styles.chip, effectiveToId === p.id && styles.chipActive]}>
                <SymbolView name={p.icon as any} size={20} tintColor={effectiveToId === p.id ? '#ffffff' : Colors.light.text} />
                <Text style={[styles.chipText, effectiveToId === p.id && styles.chipTextActive]}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Nominal</Text>
          <TextInput
            style={styles.input}
            value={amountText}
            onChangeText={setAmountText}
            placeholder="0"
            placeholderTextColor={Colors.light.secondaryText}
            keyboardType="decimal-pad"
            autoFocus
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.sheetActions}>
          <Pressable onPress={onClose} style={[styles.save, styles.cancel]}>
            <Text style={styles.cancelText}>Batal</Text>
          </Pressable>
          <Pressable onPress={onSend} style={styles.save}>
            <SymbolView name="arrow.right" size={18} tintColor="#ffffff" />
            <Text style={styles.saveText}>Pindah</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  
  // Header
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.light.text },
  addBtn: { 
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.primary, 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 12,
    gap: 6,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  addText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  
  // List
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  empty: { textAlign: 'center', opacity: 0.6, marginTop: 40, color: Colors.light.secondaryText, fontSize: 15 },
  
  // Card
  card: { 
    backgroundColor: Colors.light.cardBackground, 
    borderRadius: 16, 
    padding: 16, 
    marginBottom: 14, 
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { fontSize: 16, fontWeight: 'bold', color: Colors.light.text },
  cardBalance: { fontSize: 15, color: Colors.light.secondaryText, marginTop: 2 },
  
  // Budget
  budgetSection: { gap: 6 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: Colors.light.separator, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barText: { fontSize: 12, color: Colors.light.secondaryText },
  
  // Actions
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { 
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  editBtn: { backgroundColor: Colors.light.primaryLight },
  transferBtn: { backgroundColor: '#E3F2FD' },
  deleteBtn: { backgroundColor: '#FEE2E2' },
  actionText: { fontSize: 13, fontWeight: '600', color: Colors.light.primary },
  danger: { color: Colors.light.error },
  
  // Sheet
  sheet: { 
    marginTop: 'auto', 
    backgroundColor: Colors.light.cardBackground, 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    padding: 24, 
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.separator,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.light.text },
  sheetSubtitle: { fontSize: 14, color: Colors.light.secondaryText, marginTop: -8 },
  
  // Form
  formGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.light.secondaryText },
  input: { 
    fontSize: 16, 
    borderWidth: 1, 
    borderColor: Colors.light.separator, 
    borderRadius: 12, 
    padding: 14, 
    color: Colors.light.text, 
    backgroundColor: Colors.light.surfaceVariant 
  },
  
  // Chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14, 
    paddingVertical: 10, 
    borderRadius: 20, 
    backgroundColor: Colors.light.surfaceVariant,
    borderWidth: 1,
    borderColor: Colors.light.separator,
    gap: 6,
  },
  chipActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  chipText: { fontSize: 14, color: Colors.light.text, fontWeight: '500' },
  chipTextActive: { color: '#ffffff' },
  
  // Color Dot
  colorDot: { width: 36, height: 36, borderRadius: 18 },
  colorActive: { borderWidth: 3, borderColor: Colors.light.text },
  
  // Error
  error: { color: Colors.light.error, fontSize: 14, textAlign: 'center' },
  
  // Sheet Actions
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  save: { 
    flex: 1, 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16, 
    borderRadius: 12, 
    backgroundColor: Colors.light.primary,
    gap: 8,
  },
  cancel: { backgroundColor: Colors.light.surfaceVariant },
  saveText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelText: { color: Colors.light.text, fontSize: 16, fontWeight: '600' },
});
