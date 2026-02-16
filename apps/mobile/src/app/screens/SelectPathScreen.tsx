import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/navigation';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';
import { updateSettings } from '@/lib/api/client';
import type { Religion } from '@/lib/types';
import { tokens } from '@/lib/theme';

const RELIGIONS: {
  code: Religion;
  labelKey: string;
  icon: string;
  accent: string;
  accentBg: string;
}[] = [
  { code: 'islam', labelKey: 'common.islam', icon: '🕌', accent: '#059669', accentBg: 'rgba(16, 185, 129, 0.15)' },
  { code: 'hinduism', labelKey: 'common.hinduism', icon: '🛕', accent: '#ea580c', accentBg: 'rgba(234, 88, 12, 0.15)' },
  { code: 'christianity', labelKey: 'common.christianity', icon: '⛪', accent: '#2563eb', accentBg: 'rgba(37, 99, 235, 0.15)' },
];

export default function SelectPathScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'SelectPath'>>();
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const [selected, setSelected] = useState<Religion[]>(user?.religions ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = (religion: Religion) => {
    setSelected((prev) =>
      prev.includes(religion) ? prev.filter((r) => r !== religion) : [...prev, religion]
    );
  };

  const handleContinue = async () => {
    setError('');
    setLoading(true);
    try {
      await updateSettings({ religions: selected });
      await refreshUser();
      navigation.navigate('Main');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigation.navigate('Main');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: '#F0F5FA' }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 56,
          paddingBottom: insets.bottom + 32,
          minHeight: '100%',
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </TouchableOpacity>

      <header style={styles.header}>
        <Text style={styles.title}>{t('selectPath.title')}</Text>
        <Text style={styles.subtitle}>{t('selectPath.subtitle')}</Text>
      </header>

      <View style={styles.main}>
        {RELIGIONS.map(({ code, labelKey, icon, accent, accentBg }) => {
          const isSelected = selected.includes(code);
          return (
            <TouchableOpacity
              key={code}
              style={[
                styles.faithCard,
                isSelected && { borderWidth: 2, borderColor: accent, backgroundColor: accentBg },
              ]}
              onPress={() => toggle(code)}
              activeOpacity={0.9}
            >
              <View style={[styles.circle, isSelected && { borderWidth: 2, borderColor: accent }]}>
                <Text style={styles.icon}>{icon}</Text>
              </View>
              <Text style={[styles.label, isSelected && { color: accent }]}>{t(labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {selected.length > 0 && (
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? t('common.loading') : t('selectPath.continue')}
            </Text>
          </TouchableOpacity>
        )}
        {/* "View More Faiths" button removed - only 3 religions currently supported */}
        <TouchableOpacity onPress={handleSkip} style={styles.textButton} activeOpacity={0.8}>
          <Text style={styles.textButtonSecondary}>{t('selectPath.skip')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 32 },
  backButton: { marginBottom: 8 },
  backText: { fontSize: 16, color: tokens.colors.textSecondary },
  header: { alignItems: 'center', marginBottom: 48 },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: tokens.colors.textDark,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 24,
  },
  main: { alignItems: 'center', gap: 40, marginBottom: 24 },
  faithCard: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 8,
    borderRadius: 9999,
  },
  circle: {
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: tokens.colors.surface,
    ...tokens.shadow.elevated,
    borderWidth: 1.5,
    borderColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  icon: { fontSize: 64 },
  label: {
    fontSize: 18,
    fontWeight: '500',
    color: tokens.colors.textDark,
    letterSpacing: -0.3,
  },
  footer: { alignItems: 'center', gap: 20, marginTop: 'auto', paddingTop: 32 },
  error: { color: '#b91c1c', fontSize: 14, textAlign: 'center' },
  primaryButton: {
    backgroundColor: tokens.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: tokens.borderRadius.xl,
    alignSelf: 'stretch',
    maxWidth: 280,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  textButton: { paddingVertical: 8, paddingHorizontal: 24 },
  textButtonPrimary: {
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.textSecondary,
  },
  textButtonSecondary: {
    fontSize: 14,
    color: tokens.colors.textMuted,
  },
});
