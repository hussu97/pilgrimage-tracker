import { View, Text, StyleSheet } from 'react-native';

export default function CheckInScreen() {
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Check In</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
});
