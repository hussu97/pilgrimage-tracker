import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useI18n } from '../providers';
import { getMyCheckIns } from '../../lib/api/client';
import type { CheckIn } from '../../lib/types';

export default function CheckInsListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'CheckInsList'>>();
  const { t } = useI18n();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = useCallback(() => {
    setLoading(true);
    setError('');
    getMyCheckIns()
      .then(setCheckIns)
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{t('profile.visitedPlaces')}</Text>
      <Text style={styles.subtitle}>{t('profile.yourJourney')}</Text>

      {loading && <ActivityIndicator size="small" color="#0d9488" style={styles.loader} />}
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchList} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && checkIns.length === 0 && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>⊕</Text>
          <Text style={styles.emptyTitle}>{t('profile.noCheckInsYet')}</Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => navigation.navigate('Main')}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyCtaText}>{t('profile.exploreCta')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {!loading && !error && checkIns.length > 0 && (
        <View style={styles.list}>
          {checkIns.map((c) => (
            <TouchableOpacity
              key={c.check_in_code}
              style={styles.row}
              onPress={() => navigation.navigate('PlaceDetail', { placeCode: c.place_code })}
              activeOpacity={0.8}
            >
              <View style={styles.rowIcon}>
                <Text style={styles.rowIconText}>⊕</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {c.place?.name ?? c.place_code}
                </Text>
                <Text style={styles.rowDate}>
                  {c.checked_in_at ? new Date(c.checked_in_at).toLocaleDateString() : ''}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24 },
  backButton: { marginBottom: 16 },
  backText: { fontSize: 16, color: '#6b7280' },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  loader: { marginVertical: 24 },
  errorWrap: { marginBottom: 16 },
  errorText: { color: '#c00', marginBottom: 8 },
  retryButton: { alignSelf: 'flex-start' },
  retryText: { color: '#0d9488', fontWeight: '600' },
  emptyWrap: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  emptyIcon: { fontSize: 48, marginBottom: 16, color: '#9ca3af' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 20 },
  emptyCta: { backgroundColor: '#0d9488', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyCtaText: { color: '#fff', fontWeight: '600' },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(13, 148, 136, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowIconText: { fontSize: 24, color: '#0d9488' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  rowDate: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  chevron: { fontSize: 20, color: '#9ca3af' },
});
