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
import { ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth, useI18n } from '../providers';
import { useLocation } from '../contexts/LocationContext';
import { getPlaces } from '../../lib/api/client';
import type { Place } from '../../lib/types';
import type { RootStackParamList } from '../navigation';
import { tokens } from '../../lib/theme';
import PlaceCard from '../../components/PlaceCard';

type FilterChip = 'all' | 'mosque' | 'shrine' | 'temple';

const FILTER_CHIPS: { key: FilterChip; labelKey: string; placeType?: string }[] = [
  { key: 'all', labelKey: 'home.filterAll' },
  { key: 'mosque', labelKey: 'home.filterMosques', placeType: 'mosque' },
  { key: 'shrine', labelKey: 'home.filterShrines', placeType: 'shrine' },
  { key: 'temple', labelKey: 'home.filterTemples', placeType: 'temple' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>>();
  const { user } = useAuth();
  const { t } = useI18n();
  const { coords } = useLocation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filter, setFilter] = useState<FilterChip>('all');

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    const chip = FILTER_CHIPS.find((c) => c.key === filter);
    try {
      const data = await getPlaces({
        religions: user?.religions?.length ? user.religions : undefined,
        search: searchDebounced || undefined,
        sort: 'distance' as const,
        limit: 50,
        lat: coords.lat,
        lng: coords.lng,
        place_type: chip?.placeType,
      });
      setPlaces(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [user?.religions, searchDebounced, filter, coords, t]);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || t('home.title');
  const showEmpty = !loading && !error && places.length === 0;

  const renderListHeader = () => (
    <>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.label}>{t('nav.explore')}</Text>
            <Text style={styles.greeting}>
              {t('home.greeting')} <Text style={styles.greetingName}>{displayName}</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.mapBtn}
            onPress={() => (navigation as unknown as NativeStackNavigationProp<RootStackParamList>).navigate('Map' as never)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="map" size={20} color={tokens.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={20} color={tokens.colors.textMuted} style={styles.searchIconStyle} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('home.findPlace')}
          placeholderTextColor={tokens.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        <MaterialIcons name="tune" size={18} color={tokens.colors.textMuted} />
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsWrap}
        style={styles.chipsScroll}
      >
        {FILTER_CHIPS.map(({ key, labelKey }) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, filter === key && styles.chipActive]}
            onPress={() => setFilter(key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>
              {t(labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  if (loading && places.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderListHeader()}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.loadingText}>{t('home.loadingPlaces')}</Text>
        </View>
      </View>
    );
  }

  if (error && places.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderListHeader()}
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchPlaces}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Background gradient tint */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.gradientTop} />
      </View>

      <FlatList
        data={places}
        keyExtractor={(item) => item.place_code}
        ListHeaderComponent={renderListHeader}
        renderItem={({ item }) => <PlaceCard place={item} />}
        ListEmptyComponent={
          showEmpty ? (
            <View style={styles.centered}>
              <MaterialIcons name="location-off" size={48} color={tokens.colors.textMuted} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>{t('home.noPlacesFound')}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => setFilter('all')}>
                <Text style={styles.retryText}>{t('home.clearFilters')}</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchPlaces}
            colors={[tokens.colors.primary]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F7FF',
  },
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: '#EBF5FF',
    opacity: 0.7,
  },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.primary,
    marginBottom: 6,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  greeting: {
    fontSize: 22,
    fontWeight: '400',
    color: tokens.colors.textDark,
    letterSpacing: -0.3,
  },
  greetingName: {
    fontWeight: '700',
  },
  mapBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: tokens.borderRadius['2xl'],
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  searchIconStyle: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: tokens.colors.textDark, padding: 0 },
  chipsScroll: { marginBottom: 20 },
  chipsWrap: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: tokens.borderRadius.full,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  chipText: { fontSize: 13, fontWeight: '500', color: tokens.colors.textSecondary },
  chipTextActive: { color: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, minHeight: 200 },
  loadingText: { marginTop: 12, fontSize: 14, color: tokens.colors.textSecondary },
  errorText: { fontSize: 14, color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { fontSize: 16, color: tokens.colors.textSecondary, textAlign: 'center', marginBottom: 16 },
  retryButton: {
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: tokens.borderRadius.xl,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  listContent: { paddingHorizontal: 24, paddingTop: 4 },
  separator: { height: 16 },
});
