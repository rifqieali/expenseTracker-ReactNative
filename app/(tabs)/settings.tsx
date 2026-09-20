import { StyleSheet, Text, View } from 'react-native';

/** PIN + pengaturan — diimplementasi di tiket #7. */
export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Setting</Text>
      <Text>PIN + biometrik hadir di tiket #7.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold' },
});
