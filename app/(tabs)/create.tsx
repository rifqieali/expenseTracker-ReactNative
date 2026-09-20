import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { categories, pockets } from '@/db/schema';
import { ValidationError, recordTransaction } from '@/lib/ledger';
import { formatRp, parseAmountId } from '@/lib/money';
import type { TxType } from '@/lib/money';

/** QuickCreate: catat expense/income 1 tap. Seam: recordTransaction (atomik). */
export default function CreateScreen() {
  const [type, setType] = useState<TxType>('expense');
  const [amountText, setAmountText] = useState('');
  const [pocketId, setPocketId] = useState<number | null>(null);
  const [category, setCategory] = useState('Lainnya');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: pocketRows } = useLiveQuery(db.select().from(pockets));
  const { data: categoryRows } = useLiveQuery(db.select().from(categories));
  const pocketList = useMemo(() => pocketRows ?? [], [pocketRows]);
  const categoryList = useMemo(
    () => (categoryRows ?? []).filter((c) => c.kind === type),
    [categoryRows, type],
  );

  useEffect(() => {
    if (pocketId == null && pocketList.length > 0) setPocketId(pocketList[0].id);
  }, [pocketId, pocketList]);

  useEffect(() => {
    if (!categoryList.some((c) => c.name === category)) {
      setCategory(categoryList[0]?.name ?? 'Lainnya');
    }
  }, [categoryList, category]);

  const preview = parseAmountId(amountText);

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      await recordTransaction(db, {
        pocketId,
        type,
        amount: parseAmountId(amountText),
        category,
        note: note.trim(),
      });
      setAmountText('');
      setNote('');
      Alert.alert('Tersimpan', `${type === 'expense' ? 'Pengeluaran' : 'Pemasukan'} ${formatRp(preview ?? 0)} tercatat.`);
    } catch (e) {
      setError(e instanceof ValidationError ? e.errors.join(' ') : 'Gagal menyimpan, coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.toggleRow}>
          {(['expense', 'income'] as TxType[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[styles.toggle, type === t && (t === 'expense' ? styles.toggleExpense : styles.toggleIncome)]}>
              <Text style={[styles.toggleText, type === t && styles.toggleTextActive]}>
                {t === 'expense' ? '− Expense' : '+ Income'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Nominal</Text>
        <TextInput
          style={styles.amount}
          value={amountText}
          onChangeText={setAmountText}
          placeholder="0"
          keyboardType="decimal-pad"
          autoFocus
          returnKeyType="done"
        />
        {preview != null && preview > 0 && <Text style={styles.preview}>{formatRp(preview)}</Text>}

        <Text style={styles.label}>Kantong</Text>
        <View style={styles.chips}>
          {pocketList.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPocketId(p.id)}
              style={[styles.chip, pocketId === p.id && styles.chipActive]}>
              <Text style={[styles.chipText, pocketId === p.id && styles.chipTextActive]}>
                {p.icon} {p.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Kategori</Text>
        <View style={styles.chips}>
          {categoryList.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCategory(c.name)}
              style={[styles.chip, category === c.name && styles.chipActive]}>
              <Text style={[styles.chipText, category === c.name && styles.chipTextActive]}>
                {c.icon} {c.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Catatan (opsional)</Text>
        <TextInput
          style={styles.note}
          value={note}
          onChangeText={setNote}
          placeholder="cth. nasi padang"
          returnKeyType="done"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable onPress={onSave} disabled={saving} style={[styles.save, saving && styles.saveDisabled]}>
          <Text style={styles.saveText}>{saving ? 'Menyimpan…' : 'Simpan'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 10 },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggle: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#eee', alignItems: 'center' },
  toggleExpense: { backgroundColor: '#EB5757' },
  toggleIncome: { backgroundColor: '#27AE60' },
  toggleText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  toggleTextActive: { color: '#fff' },
  label: { fontSize: 14, fontWeight: '600', opacity: 0.7, marginTop: 6 },
  amount: { fontSize: 36, fontWeight: 'bold', borderBottomWidth: 2, borderColor: '#2F80ED', paddingVertical: 4 },
  preview: { fontSize: 16, color: '#2F80ED', fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2F80ED' },
  chipText: { fontSize: 14, color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  note: { fontSize: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10 },
  error: { color: '#EB5757', fontSize: 14 },
  save: { marginTop: 8, padding: 16, borderRadius: 12, backgroundColor: '#2F80ED', alignItems: 'center' },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
