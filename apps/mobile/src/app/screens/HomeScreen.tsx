import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useI18n } from '../providers';
import { getPlaces } from '../../lib/api/client';
import PlaceCard from '../../components/PlaceCard';
import type { Place } from '../../lib/types';

type FilterChip = 'nearby' | 'historical' | '';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useI18n();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filter, setFilter] = useState<FilterChip>('');

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = {
      religions: user?.religions?.length ? user.religions : undefined,
      search: searchDebounced || undefined,
      sort: 'distance' as const,
      limit: 50,
      place_type: filter === 'historical' ? 'temple' : undefined,
    };
    try {
      const data = await getPlaces(params);
      setPlaces(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [user?.religions, searchDebounced, filter, t]);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || '';
  const showEmpty = !loading && !error && places.length === 0;
  const showList = !loading && !error && places.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>{t('nav.explore')}</Text>
          <Text style={styles.title}>
            {displayName ? `Welcome, ${displayName}` : t('home.title')}
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={t('home.findPlace')}
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.chips}>
        <TouchableOpacity
          style={[styles.chip, filter === 'nearby' && styles.chipActive]}
          onPress={() => setFilter((f) => (f === 'nearby' ? '' : 'nearby'))}
        >
          <Text style={[styles.chipText, filter === 'nearby' && styles.chipTextActive]}>
            {t('home.nearby')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, filter === 'historical' && styles.chipActive]}
          onPress={() => setFilter((f) => (f === 'historical' ? '' : 'historical'))}
        >
          <Text style={[styles.chipText, filter === 'historical' && styles.chipTextActive]}>
            Historical
          </Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0d9488" />
          <Text style={styles.loadingText}>{t('home.loadingPlaces')}</Text>
        </View>
      )}

      {error && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchPlaces}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {showEmpty && (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>⊕</Text>
          <Text style={styles.emptyTitle}>{t('home.noPlacesFound')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchPlaces}>
            <Text style={styles.retryText}>{t('home.explorePlaces')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {showList && (
        <FlatList
          data={places}
          keyExtractor={(item) => item.place_code}
          renderItem={({ item }) => <PlaceCard place={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchPlaces} colors={['#0d9488']} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#0d9488', marginBottom: 4, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchIcon: { fontSize: 18, color: '#94a3b8', marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#111' },
  chips: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 16 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  chipTextActive: { color: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6b7280' },
  errorText: { fontSize: 14, color: '#dc2626', textAlign: 'center', marginBottom: 12 },
  emptyIcon: { fontSize: 48, color: '#9ca3af', marginBottom: 12 },
  emptyTitle: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginBottom: 16 },
  retryButton: {
    backgroundColor: '#0d9488',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  listContent: { paddingHorizontal: 20, paddingTop: 4 },
  separator: { height: 16 },
});
