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
import { SymbolView } from 'expo-symbols';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { categories, pockets } from '@/db/schema';
import { ValidationError, recordTransaction } from '@/lib/ledger';
import { formatRp, parseAmountId } from '@/lib/money';
import type { TxType } from '@/lib/money';
import Colors from '@/constants/Colors';

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
        {/* Type Toggle */}
        <View style={styles.toggleRow}>
          {(['expense', 'income'] as TxType[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[styles.toggle, type === t && (t === 'expense' ? styles.toggleExpense : styles.toggleIncome)]}>
              <SymbolView 
                name={t === 'expense' ? 'arrow.up.right' : 'arrow.down.left'} 
                size={18} 
                tintColor={type === t ? '#ffffff' : Colors.light.text}
              />
              <Text style={[styles.toggleText, type === t && styles.toggleTextActive]}>
                {t === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Amount Input */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Nominal</Text>
          <TextInput
            style={styles.amount}
            value={amountText}
            onChangeText={setAmountText}
            placeholder="0"
            keyboardType="decimal-pad"
            autoFocus
            returnKeyType="done"
          />
          {preview != null && preview > 0 && (
            <Text style={styles.preview}>{formatRp(preview)}</Text>
          )}
        </View>

        {/* Pocket Selection */}
        <View style={styles.sectionCard}>
          <Text style={styles.label}>Kantong</Text>
          <View style={styles.chips}>
            {pocketList.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setPocketId(p.id)}
                style={[styles.chip, pocketId === p.id && styles.chipActive]}>
                <SymbolView name={p.icon as any} size={16} tintColor={pocketId === p.id ? '#ffffff' : p.color} />
                <Text style={[styles.chipText, pocketId === p.id && styles.chipTextActive]}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Category Selection */}
        <View style={styles.sectionCard}>
          <Text style={styles.label}>Kategori</Text>
          <View style={styles.chips}>
            {categoryList.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.name)}
                style={[styles.chip, category === c.name && styles.chipActive]}>
                <SymbolView name={c.icon as any} size={16} tintColor={category === c.name ? '#ffffff' : Colors.light.primary} />
                <Text style={[styles.chipText, category === c.name && styles.chipTextActive]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Note */}
        <View style={styles.sectionCard}>
          <Text style={styles.label}>Catatan (opsional)</Text>
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            placeholder="cth. nasi padang"
            placeholderTextColor={Colors.light.secondaryText}
            returnKeyType="done"
          />
        </View>

        {/* Error */}
        {error && <Text style={styles.error}>{error}</Text>}

        {/* Save Button */}
        <Pressable onPress={onSave} disabled={saving} style={[styles.save, saving && styles.saveDisabled]}>
          <SymbolView name="checkmark.circle.fill" size={20} tintColor="#ffffff" />
          <Text style={styles.saveText}>{saving ? 'Menyimpan…' : 'Simpan Transaksi'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  scroll: { padding: 20, gap: 16, paddingBottom: 32 },
  
  // Type Toggle
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggle: { 
    flex: 1, 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16, 
    borderRadius: 14, 
    backgroundColor: Colors.light.cardBackground,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleExpense: { backgroundColor: Colors.light.error },
  toggleIncome: { backgroundColor: Colors.light.success },
  toggleText: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  toggleTextActive: { color: '#fff' },
  
  // Amount Card
  amountCard: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  amountLabel: { fontSize: 14, fontWeight: '600', color: Colors.light.secondaryText, marginBottom: 8 },
  amount: { 
    fontSize: 40, 
    fontWeight: 'bold', 
    color: Colors.light.text,
    borderBottomWidth: 2,
    borderColor: Colors.light.primary,
    paddingBottom: 8,
  },
  preview: { fontSize: 16, color: Colors.light.primary, fontWeight: '600', marginTop: 8 },
  
  // Section Cards
  sectionCard: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  label: { fontSize: 14, fontWeight: '600', color: Colors.light.secondaryText, marginBottom: 10 },
  
  // Chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 14, 
    paddingVertical: 10, 
    borderRadius: 20, 
    backgroundColor: Colors.light.surfaceVariant,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.light.separator,
  },
  chipActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  chipText: { fontSize: 14, color: Colors.light.text, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  
  // Note
  note: { 
    fontSize: 15, 
    borderWidth: 1, 
    borderColor: Colors.light.separator, 
    borderRadius: 12, 
    padding: 14, 
    color: Colors.light.text, 
    backgroundColor: Colors.light.surfaceVariant 
  },
  
  // Error
  error: { color: Colors.light.error, fontSize: 14, textAlign: 'center' },
  
  // Save Button
  save: { 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8, 
    padding: 18, 
    borderRadius: 14, 
    backgroundColor: Colors.light.primary, 
    gap: 8,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
