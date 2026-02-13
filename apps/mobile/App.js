import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { I18nProvider } from './context/I18nContext';
import SettingsScreen from './screens/SettingsScreen';

export default function App() {
  return (
    <I18nProvider>
      <View style={styles.container}>
        <SettingsScreen />
        <StatusBar style="auto" />
      </View>
    </I18nProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
