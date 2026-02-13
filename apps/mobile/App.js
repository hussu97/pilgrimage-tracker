import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nProvider } from './context/I18nContext';
import LanguageScreen from './screens/LanguageScreen';
import SettingsScreen from './screens/SettingsScreen';

const LANGUAGE_CHOSEN_KEY = 'pilgrimage-language-chosen';

export default function App() {
  const [languageChosen, setLanguageChosenState] = useState(null);

  React.useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_CHOSEN_KEY).then((v) => {
      setLanguageChosenState(v === 'true');
    });
  }, []);

  const handleLanguageContinue = React.useCallback(async () => {
    await AsyncStorage.setItem(LANGUAGE_CHOSEN_KEY, 'true');
    setLanguageChosenState(true);
  }, []);

  return (
    <I18nProvider>
      <View style={styles.container}>
        {languageChosen === null ? (
          <View style={styles.centered}>
            <View style={styles.loadingDot} />
          </View>
        ) : languageChosen === false ? (
          <LanguageScreen onContinue={handleLanguageContinue} />
        ) : (
          <SettingsScreen />
        )}
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#999',
  },
});
