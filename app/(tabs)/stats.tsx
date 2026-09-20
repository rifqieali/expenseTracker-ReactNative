import { StyleSheet, Text, View } from 'react-native';

/** Grafik bulanan — diimplementasi di tiket #6. */
export default function StatsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Stats</Text>
      <Text>Grafik bulanan hadir di tiket #6.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold' },
});
