import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useAuth } from '../providers';
import { useI18n } from '../providers';
import { updateSettings } from '../../lib/api/client';
import type { Religion } from '../../lib/types';

const RELIGIONS: { code: Religion; labelKey: string }[] = [
  { code: 'islam', labelKey: 'common.islam' },
  { code: 'hinduism', labelKey: 'common.hinduism' },
  { code: 'christianity', labelKey: 'common.christianity' },
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
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
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
      <Text style={styles.title}>{t('selectPath.title')}</Text>
      <Text style={styles.subtitle}>{t('selectPath.subtitle')}</Text>
      <View style={styles.cards}>
        {RELIGIONS.map(({ code, labelKey }) => (
          <TouchableOpacity
            key={code}
            style={[styles.card, selected.includes(code) && styles.cardSelected]}
            onPress={() => toggle(code)}
            activeOpacity={0.8}
          >
            <Text style={[styles.cardLabel, selected.includes(code) && styles.cardLabelSelected]}>
              {t(labelKey)}
            </Text>
            {selected.includes(code) ? (
              <Text style={styles.checkmark}>✓</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>{t('selectPath.hint')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
      <TouchableOpacity style={styles.secondaryButton} onPress={handleSkip} activeOpacity={0.8}>
        <Text style={styles.secondaryButtonText}>{t('selectPath.skip')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24 },
  backButton: { marginBottom: 16 },
  backText: { fontSize: 16, color: '#6b7280' },
  title: { fontSize: 24, fontWeight: '600', color: '#111', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 24 },
  cards: { marginBottom: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  cardSelected: { borderColor: '#0d9488', backgroundColor: 'rgba(13, 148, 136, 0.05)' },
  cardLabel: { fontSize: 16, fontWeight: '500', color: '#333' },
  cardLabelSelected: { color: '#0d9488' },
  checkmark: { fontSize: 18, color: '#0d9488' },
  hint: { fontSize: 12, color: '#888', marginBottom: 24 },
  error: { color: '#c00', fontSize: 14, marginBottom: 12 },
  primaryButton: {
    backgroundColor: '#0d9488',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  secondaryButtonText: { fontSize: 16, color: '#666' },
});
