import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { categories } from '@/db/schema';
import type { Category } from '@/db/schema';
import { createCategory, deleteCategory, updateCategory, iconsForKind } from '@/lib/categories';
import { exportAll, exportTransactions, exportPockets, exportCategories, importTransactions, importPockets, importCategories } from '@/lib/csv';
import { ValidationError } from '@/lib/errors';
import Colors from '@/constants/Colors';

interface SettingItemProps {
  icon: string;
  iconColor?: string;
  iconBg?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  showArrow?: boolean;
}

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingItem({ icon, iconColor = Colors.light.primary, iconBg, label, value, onPress, showArrow = true }: SettingItemProps) {
  return (
    <Pressable onPress={onPress} style={styles.settingItem}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIconWrap, { backgroundColor: iconBg || Colors.light.primaryLight }]}>
          <SymbolView name={icon as any} size={20} tintColor={iconColor} />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <View style={styles.settingRight}>
        {value && <Text style={styles.settingValue}>{value}</Text>}
        {showArrow && <SymbolView name="chevron.right" size={16} tintColor={Colors.light.secondaryText} />}
      </View>
    </Pressable>
  );
}

function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [currency, setCurrency] = useState('IDR');
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catKindFilter, setCatKindFilter] = useState<'expense' | 'income'>('expense');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catFormOpen, setCatFormOpen] = useState(false);

  const { data: catRows } = useLiveQuery(db.select().from(categories));
  const allCategories = useMemo(() => catRows ?? [], [catRows]);
  const filteredCategories = useMemo(
    () => allCategories.filter((c) => c.kind === catKindFilter),
    [allCategories, catKindFilter],
  );

  function handleCurrencyChange() {
    Alert.alert(
      'Ubah Mata Uang',
      'Pilih mata uang default:',
      [
        { text: 'IDR (Rupiah)', onPress: () => setCurrency('IDR') },
        { text: 'USD (Dollar)', onPress: () => setCurrency('USD') },
        { text: 'Batal', style: 'cancel' },
      ]
    );
  }

  function handleAbout() {
    Alert.alert(
      'Tentang ExpenseTracker',
      'Versi 1.0.0\n\nAplikasi pencatatan pengeluaran dan pemasukan pribadi yang berjalan offline.',
      [{ text: 'OK' }]
    );
  }

  function handleExport() {
    Alert.alert(
      'Ekspor Data',
      'Pilih data yang ingin diekspor:',
      [
        { text: 'Semua Data', onPress: handleExportAll },
        { text: 'Transaksi Saja', onPress: handleExportTransactions },
        { text: 'Kantong Saja', onPress: handleExportPockets },
        { text: 'Kategori Saja', onPress: handleExportCategories },
        { text: 'Batal', style: 'cancel' },
      ]
    );
  }

  async function handleExportAll() {
    try {
      await exportAll();
      Alert.alert('Berhasil', 'Data berhasil diekspor.');
    } catch (e) {
      Alert.alert('Gagal', 'Gagal mengekspor data.');
    }
  }

  async function handleExportTransactions() {
    try {
      await exportTransactions();
      Alert.alert('Berhasil', 'Transaksi berhasil diekspor.');
    } catch (e) {
      Alert.alert('Gagal', 'Gagal mengekspor transaksi.');
    }
  }

  async function handleExportPockets() {
    try {
      await exportPockets();
      Alert.alert('Berhasil', 'Kantong berhasil diekspor.');
    } catch (e) {
      Alert.alert('Gagal', 'Gagal mengekspor kantong.');
    }
  }

  async function handleExportCategories() {
    try {
      await exportCategories();
      Alert.alert('Berhasil', 'Kategori berhasil diekspor.');
    } catch (e) {
      Alert.alert('Gagal', 'Gagal mengekspor kategori.');
    }
  }

  function handleImport() {
    Alert.alert(
      'Impor Data',
      'Pilih jenis data yang ingin diimpor dari file CSV:',
      [
        { text: 'Transaksi', onPress: handleImportTransactions },
        { text: 'Kantong', onPress: handleImportPockets },
        { text: 'Kategori', onPress: handleImportCategories },
        { text: 'Batal', style: 'cancel' },
      ]
    );
  }

  async function handleImportTransactions() {
    try {
      const count = await importTransactions();
      Alert.alert('Berhasil', `${count} transaksi berhasil diimpor.`);
    } catch (e) {
      Alert.alert('Gagal', 'Gagal mengimpor transaksi. Pastikan format CSV benar.');
    }
  }

  async function handleImportPockets() {
    try {
      const count = await importPockets();
      Alert.alert('Berhasil', `${count} kantong berhasil diimpor.`);
    } catch (e) {
      Alert.alert('Gagal', 'Gagal mengimpor kantong. Pastikan format CSV benar.');
    }
  }

  async function handleImportCategories() {
    try {
      const count = await importCategories();
      Alert.alert('Berhasil', `${count} kategori berhasil diimpor.`);
    } catch (e) {
      Alert.alert('Gagal', 'Gagal mengimpor kategori. Pastikan format CSV benar.');
    }
  }

  function handleClearData() {
    Alert.alert(
      'Hapus Semua Data?',
      'Tindakan ini tidak dapat dibatalkan. Semua data transaksi dan kantong akan dihapus secara permanen.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: () => {} },
      ]
    );
  }

  function handleDeleteCategory(cat: Category) {
    if (cat.name === 'Lainnya' || cat.name === 'Transfer') {
      Alert.alert('Tidak bisa dihapus', 'Kategori bawaan tidak bisa dihapus.');
      return;
    }
    Alert.alert('Hapus Kategori?', `Hapus "${cat.name}" dari daftar?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCategory(db, cat.id);
          } catch (e) {
            Alert.alert('Gagal', e instanceof ValidationError ? e.errors.join(' ') : 'Gagal menghapus.');
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
        <View style={styles.avatarWrap}>
          <SymbolView name="person.circle.fill" size={48} tintColor="#ffffff" />
        </View>
        <Text style={styles.userName}>Pengguna</Text>
        <Text style={styles.userEmail}>user@email.com</Text>
      </LinearGradient>

      <SettingSection title="Akun">
        <SettingItem icon="person.circle" label="Profil" value="Pengguna" onPress={() => {}} />
        <SettingItem icon="envelope" label="Email" value="user@email.com" onPress={() => {}} />
      </SettingSection>

      <SettingSection title="Katalog">
        <SettingItem
          icon="list.bullet.rectangle"
          iconBg="#E3F2FD"
          label="Kategori"
          value={`${allCategories.length} item`}
          onPress={() => setCatModalOpen(true)}
        />
      </SettingSection>

      <SettingSection title="Preferensi">
        <SettingItem
          icon="coloncurrencysign.circle"
          label="Mata Uang"
          value={currency}
          onPress={handleCurrencyChange}
        />
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <View style={[styles.settingIconWrap, { backgroundColor: Colors.light.primaryLight }]}>
              <SymbolView name="bell.badge" size={20} tintColor={Colors.light.primary} />
            </View>
            <Text style={styles.settingLabel}>Notifikasi</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: Colors.light.separator, true: Colors.light.primary }}
            thumbColor="#ffffff"
          />
        </View>
      </SettingSection>

      <SettingSection title="Keamanan">
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <View style={[styles.settingIconWrap, { backgroundColor: '#E8F5E9' }]}>
              <SymbolView name="lock.shield" size={20} tintColor={Colors.light.success} />
            </View>
            <Text style={styles.settingLabel}>PIN Aplikasi</Text>
          </View>
          <View style={styles.settingRight}>
            <Text style={styles.settingValue}>Belum diatur</Text>
            <SymbolView name="chevron.right" size={16} tintColor={Colors.light.secondaryText} />
          </View>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <View style={[styles.settingIconWrap, { backgroundColor: '#FFF3E0' }]}>
              <SymbolView name="faceid" size={20} tintColor={Colors.light.warning} />
            </View>
            <Text style={styles.settingLabel}>Biometrik</Text>
          </View>
          <Switch
            value={biometricsEnabled}
            onValueChange={setBiometricsEnabled}
            trackColor={{ false: Colors.light.separator, true: Colors.light.primary }}
            thumbColor="#ffffff"
          />
        </View>
      </SettingSection>

      <SettingSection title="Data">
        <SettingItem icon="square.and.arrow.up" iconBg="#E3F2FD" label="Ekspor Data" onPress={handleExport} />
        <SettingItem icon="square.and.arrow.down" iconBg="#E8F5E9" iconColor={Colors.light.success} label="Impor Data" onPress={handleImport} />
        <Pressable onPress={handleClearData} style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <View style={[styles.settingIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <SymbolView name="trash" size={20} tintColor={Colors.light.error} />
            </View>
            <Text style={styles.dangerLabel}>Hapus Semua Data</Text>
          </View>
        </Pressable>
      </SettingSection>

      <SettingSection title="Lainnya">
        <SettingItem icon="info.circle" iconBg="#E3F2FD" label="Tentang" value="v1.0.0" onPress={handleAbout} />
        <SettingItem icon="questionmark.circle" iconBg="#F3E5F5" iconColor="#9C27B0" label="Bantuan" onPress={() => {}} />
        <SettingItem icon="star" iconBg="#FFF3E0" iconColor={Colors.light.warning} label="Beri Penilaian" onPress={() => {}} />
      </SettingSection>

      <Text style={styles.version}>ExpenseTracker v1.0.0</Text>

      {/* Category Management Modal */}
      <Modal visible={catModalOpen} animationType="slide" transparent onRequestClose={() => setCatModalOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Kelola Kategori</Text>

          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => setCatKindFilter('expense')}
              style={[styles.toggle, catKindFilter === 'expense' && styles.toggleActive]}>
              <Text style={[styles.toggleText, catKindFilter === 'expense' && styles.toggleTextActive]}>Pengeluaran</Text>
            </Pressable>
            <Pressable
              onPress={() => setCatKindFilter('income')}
              style={[styles.toggle, catKindFilter === 'income' && styles.toggleActive]}>
              <Text style={[styles.toggleText, catKindFilter === 'income' && styles.toggleTextActive]}>Pemasukan</Text>
            </Pressable>
          </View>

          <View style={styles.catList}>
            {filteredCategories.map((cat) => (
              <View key={cat.id} style={styles.catRow}>
                <View style={styles.catLeft}>
                  <View style={[styles.catIconWrap, { backgroundColor: Colors.light.primaryLight }]}>
                    <SymbolView name={cat.icon as any} size={18} tintColor={Colors.light.primary} />
                  </View>
                  <Text style={styles.catName}>{cat.name}</Text>
                </View>
                <View style={styles.catActions}>
                  <Pressable
                    onPress={() => { setEditingCat(cat); setCatFormOpen(true); }}
                    style={styles.catActionBtn}>
                    <SymbolView name="pencil" size={14} tintColor={Colors.light.primary} />
                  </Pressable>
                  {cat.name !== 'Lainnya' && cat.name !== 'Transfer' && (
                    <Pressable
                      onPress={() => handleDeleteCategory(cat)}
                      style={styles.catActionBtn}>
                      <SymbolView name="trash" size={14} tintColor={Colors.light.error} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => { setEditingCat(null); setCatFormOpen(true); }}
            style={styles.addCatBtn}>
            <SymbolView name="plus.circle.fill" size={18} tintColor="#ffffff" />
            <Text style={styles.addCatBtnText}>Tambah Kategori</Text>
          </Pressable>

          <Pressable onPress={() => setCatModalOpen(false)} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Tutup</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Category Form Modal */}
      <CategoryFormModal
        visible={catFormOpen}
        editing={editingCat}
        kind={catKindFilter}
        onClose={() => { setCatFormOpen(false); setEditingCat(null); }}
      />
    </ScrollView>
  );
}

function CategoryFormModal({ visible, editing, kind, onClose }: { visible: boolean; editing: Category | null; kind: 'expense' | 'income'; onClose: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('cart.fill');
  const [error, setError] = useState<string | null>(null);
  const icons = iconsForKind(kind);

  const formKey = editing ? `e:${editing.id}` : 'new';
  useState(() => {});

  useMemo(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setIcon(editing?.icon ?? icons[0]);
    setError(null);
  }, [visible, formKey]);

  async function onSave() {
    setError(null);
    try {
      if (editing) {
        await updateCategory(db, editing.id, { name, icon });
      } else {
        await createCategory(db, { name, icon, kind });
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
        <Text style={styles.sheetTitle}>{editing ? 'Ubah Kategori' : 'Kategori Baru'}</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Nama</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="cth. Makanan"
            placeholderTextColor={Colors.light.secondaryText}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Ikon</Text>
          <View style={styles.chips}>
            {icons.map((i) => (
              <Pressable key={i} onPress={() => setIcon(i)} style={[styles.chip, icon === i && styles.chipActive]}>
                <SymbolView name={i as any} size={20} tintColor={icon === i ? '#ffffff' : Colors.light.text} />
              </Pressable>
            ))}
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.sheetActions}>
          <Pressable onPress={onClose} style={[styles.saveBtn, styles.cancelBtn]}>
            <Text style={styles.cancelBtnText}>Batal</Text>
          </Pressable>
          <Pressable onPress={onSave} style={styles.saveBtn}>
            <SymbolView name="checkmark.circle.fill" size={18} tintColor="#ffffff" />
            <Text style={styles.saveBtnText}>Simpan</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  userName: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  userEmail: { color: '#ffffff', opacity: 0.8, fontSize: 14, marginTop: 4 },

  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  sectionContent: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.separator,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: { fontSize: 15, color: Colors.light.text, fontWeight: '500' },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingValue: { fontSize: 14, color: Colors.light.secondaryText },
  dangerLabel: { fontSize: 15, color: Colors.light.error, fontWeight: '500' },
  version: { textAlign: 'center', fontSize: 12, color: Colors.light.secondaryText, marginTop: 8 },

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

  // Toggle
  toggleRow: { flexDirection: 'row', gap: 10 },
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

  // Category list
  catList: { gap: 8 },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.light.surfaceVariant,
    borderRadius: 12,
  },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  catActions: { flexDirection: 'row', gap: 8 },
  catActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.cardBackground,
  },

  addCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.primary,
    gap: 8,
  },
  addCatBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  closeBtn: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.surfaceVariant,
    alignItems: 'center',
  },
  closeBtnText: { color: Colors.light.text, fontSize: 15, fontWeight: '600' },

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
    backgroundColor: Colors.light.surfaceVariant,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surfaceVariant,
    borderWidth: 1,
    borderColor: Colors.light.separator,
  },
  chipActive: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },

  error: { color: Colors.light.error, fontSize: 14, textAlign: 'center' },

  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.light.primary,
    gap: 8,
  },
  cancelBtn: { backgroundColor: Colors.light.surfaceVariant },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelBtnText: { color: Colors.light.text, fontSize: 16, fontWeight: '600' },
});
