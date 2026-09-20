import { StyleSheet, Text, View } from 'react-native';

/** CRUD kantong + budget — diimplementasi di tiket #4. */
export default function PocketsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kantong</Text>
      <Text>CRUD kantong + budget hadir di tiket #4.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold' },
});
