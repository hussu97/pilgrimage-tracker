import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useI18n } from '../context/I18nContext';

export default function LanguageScreen({ onContinue }) {
  const { t, locale, setLocale, languages, ready } = useI18n();
  const [continuing, setContinuing] = useState(false);

  const handleContinue = async () => {
    if (continuing) return;
    setContinuing(true);
    try {
      await (typeof onContinue === 'function' && onContinue());
    } finally {
      setContinuing(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('settings.language')}</Text>
      <Text style={styles.subtitle}>{t('selectPath.subtitle')}</Text>
      <View style={styles.languageList}>
        {languages.map((opt) => (
          <TouchableOpacity
            key={opt.code}
            style={[styles.languageRow, locale === opt.code && styles.languageRowActive]}
            onPress={() => setLocale(opt.code)}
            activeOpacity={0.7}
            disabled={continuing}
          >
            <Text style={[styles.languageName, locale === opt.code && styles.languageNameActive]}>
              {opt.name}
            </Text>
            {locale === opt.code && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.continueButton, continuing && styles.continueButtonDisabled]}
        onPress={handleContinue}
        activeOpacity={0.8}
        disabled={continuing}
      >
        {continuing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.continueButtonText}>{t('selectPath.continue')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#111' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  languageList: { marginBottom: 32 },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 8,
  },
  languageRowActive: { backgroundColor: '#e3f2fd' },
  languageName: { fontSize: 16, color: '#333' },
  languageNameActive: { fontWeight: '600', color: '#1976d2' },
  checkmark: { fontSize: 18, color: '#1976d2' },
  muted: { fontSize: 14, color: '#666' },
  continueButton: {
    backgroundColor: '#1976d2',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonDisabled: { opacity: 0.8 },
  continueButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
