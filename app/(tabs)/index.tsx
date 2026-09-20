import { StyleSheet, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { pockets } from '@/db/schema';

/** Dashboard ringkasan — v1 penuh di tiket #5, fondasi di sini buktikan DB terbaca live. */
export default function HomeScreen() {
  const { data } = useLiveQuery(db.select().from(pockets));
  const list = data ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ExpenseTracker</Text>
      <Text style={styles.subtitle}>Database siap — {list.length} kantong:</Text>
      {list.map((p) => (
        <Text key={p.id} style={styles.row}>
          {p.icon} {p.name} — Rp{p.balance.toLocaleString('id-ID')}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 16, opacity: 0.7 },
  row: { fontSize: 16 },
});
