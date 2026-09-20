import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { and, eq, gte, lt, ne } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { pockets, transactions } from '@/db/schema';
import type { Pocket } from '@/db/schema';
import { ValidationError, transferFunds } from '@/lib/ledger';
import { createPocket, deletePocket, updatePocket } from '@/lib/pockets';
import { formatRp, monthRange, parseAmountId } from '@/lib/money';

const ICONS = ['💰', '🏠', '🍜', '🐷', '✈️', '🎮', '💊', '📚'];
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
    Alert.alert('Hapus kantong?', `${p.icon} ${p.name}`, [
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
          <Text style={styles.cardIcon}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardBalance}>{formatRp(item.balance)}</Text>
          </View>
        </View>
        {item.budgetLimit > 0 && (
          <View>
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.round(progress * 100)}%` as const, backgroundColor: progress >= 1 ? '#EB5757' : item.color },
                ]}
              />
            </View>
            <Text style={styles.barText}>
              {formatRp(used)} / {formatRp(item.budgetLimit)}
            </Text>
          </View>
        )}
        <View style={styles.actions}>
          <Pressable onPress={() => { setEditing(item); setFormOpen(true); }} style={styles.actionBtn}>
            <Text style={styles.actionText}>Ubah</Text>
          </Pressable>
          {list.length > 1 && (
            <Pressable onPress={() => setTransferFrom(item)} style={styles.actionBtn}>
              <Text style={styles.actionText}>Pindah</Text>
            </Pressable>
          )}
          <Pressable onPress={() => onDelete(item)} style={styles.actionBtn}>
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
          <Text style={styles.addText}>+ Tambah</Text>
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
        <Text style={styles.sheetTitle}>{editing ? 'Ubah kantong' : 'Kantong baru'}</Text>
        <Text style={styles.label}>Nama</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="cth. Darurat" />
        <Text style={styles.label}>Ikon</Text>
        <View style={styles.chips}>
          {ICONS.map((i) => (
            <Pressable key={i} onPress={() => setIcon(i)} style={[styles.chip, icon === i && styles.chipActive]}>
              <Text style={styles.chipText}>{i}</Text>
            </Pressable>
          ))}
        </View>
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
        <Text style={styles.label}>Budget bulanan (0 = tanpa batas)</Text>
        <TextInput
          style={styles.input}
          value={budgetText}
          onChangeText={setBudgetText}
          placeholder="0"
          keyboardType="decimal-pad"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.sheetActions}>
          <Pressable onPress={onClose} style={[styles.save, styles.cancel]}>
            <Text style={styles.saveText}>Batal</Text>
          </Pressable>
          <Pressable onPress={onSave} style={styles.save}>
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
        <Text style={styles.sheetTitle}>
          Pindah dari {from.icon} {from.name} ({formatRp(from.balance)})
        </Text>
        <Text style={styles.label}>Ke kantong</Text>
        <View style={styles.chips}>
          {targets.map((p) => (
            <Pressable key={p.id} onPress={() => setToId(p.id)} style={[styles.chip, effectiveToId === p.id && styles.chipActive]}>
              <Text style={[styles.chipText, effectiveToId === p.id && styles.chipTextActive]}>
                {p.icon} {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Nominal</Text>
        <TextInput
          style={styles.input}
          value={amountText}
          onChangeText={setAmountText}
          placeholder="0"
          keyboardType="decimal-pad"
          autoFocus
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.sheetActions}>
          <Pressable onPress={onClose} style={[styles.save, styles.cancel]}>
            <Text style={styles.saveText}>Batal</Text>
          </Pressable>
          <Pressable onPress={onSend} style={styles.save}>
            <Text style={styles.saveText}>Pindah</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold' },
  addBtn: { backgroundColor: '#2F80ED', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addText: { color: '#fff', fontWeight: 'bold' },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  empty: { textAlign: 'center', opacity: 0.6, marginTop: 32 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, gap: 8, elevation: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 30 },
  cardName: { fontSize: 16, fontWeight: 'bold' },
  cardBalance: { fontSize: 15, opacity: 0.8 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: '#eee', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barText: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 2 },
  actionBtn: { paddingVertical: 4 },
  actionText: { color: '#2F80ED', fontWeight: '600' },
  danger: { color: '#EB5757' },
  sheet: { marginTop: 'auto', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold' },
  label: { fontSize: 14, fontWeight: '600', opacity: 0.7 },
  input: { fontSize: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2F80ED' },
  chipText: { fontSize: 16, color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorActive: { borderWidth: 3, borderColor: '#000' },
  error: { color: '#EB5757', fontSize: 14 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  save: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#2F80ED', alignItems: 'center' },
  cancel: { backgroundColor: '#999' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
