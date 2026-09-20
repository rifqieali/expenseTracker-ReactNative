import { StyleSheet, Text, View } from 'react-native';

/** Bottom-sheet QuickCreate expense/income — diimplementasi di tiket #3. */
export default function CreateScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Catat</Text>
      <Text>Bottom sheet expense/income hadir di tiket #3.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold' },
});
