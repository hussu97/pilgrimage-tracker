import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useI18n } from '../context/I18nContext';

export default function SettingsScreen() {
  const { t, locale, setLocale, languages, ready } = useI18n();

  if (!ready) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('settings.title')}</Text>
      <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
      <View style={styles.languageList}>
        {languages.map((opt) => (
          <TouchableOpacity
            key={opt.code}
            style={[styles.languageRow, locale === opt.code && styles.languageRowActive]}
            onPress={() => setLocale(opt.code)}
            activeOpacity={0.7}
          >
            <Text style={[styles.languageName, locale === opt.code && styles.languageNameActive]}>
              {opt.name}
            </Text>
            {locale === opt.code && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>
        {t('settings.appearance')} – {t('settings.theme')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24, color: '#111' },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12, color: '#333' },
  languageList: { marginBottom: 24 },
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
  hint: { fontSize: 12, color: '#888' },
});
