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
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth, useI18n } from '../providers';
import { useLocation } from '../contexts/LocationContext';
import { getPlaces } from '../../lib/api/client';
import PlaceCard from '../../components/PlaceCard';
import type { Place } from '../../lib/types';
import type { RootStackParamList } from '../navigation';
import { tokens } from '../../lib/theme';

type FilterChip = 'nearby' | 'historical' | 'jummah' | 'events' | '';

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

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
  const [filter, setFilter] = useState<FilterChip>('nearby');

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = {
      religions: user?.religions?.length ? user.religions : undefined,
      search: searchDebounced || undefined,
      sort: 'distance' as const,
      limit: 50,
      lat: coords.lat,
      lng: coords.lng,
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
  }, [user?.religions, searchDebounced, filter, coords, t]);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || t('home.title');
  const heroPlace = places.length > 0 ? places[0] : null;
  const restPlaces = places.slice(1);
  const showEmpty = !loading && !error && places.length === 0;
  const showList = !loading && !error && places.length > 0;

  const renderHero = () => {
    if (!heroPlace) return null;
    return (
      <TouchableOpacity
        style={styles.heroCard}
        onPress={() => navigation.navigate('PlaceDetail', { placeCode: heroPlace.place_code })}
        activeOpacity={0.95}
      >
        <View style={styles.heroImageWrap}>
          {heroPlace.image_urls?.[0] ? (
            <Image source={{ uri: heroPlace.image_urls[0] }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroImagePlaceholder}>
              <Text style={styles.heroPlaceholderIcon}>⊕</Text>
            </View>
          )}
          <View style={styles.heroOverlay} pointerEvents="none" />
          {(heroPlace.user_has_checked_in || heroPlace.is_open_now) && (
            <View style={styles.heroBadges}>
              {heroPlace.is_open_now && (
                <View style={styles.openNowBadge}>
                  <View style={styles.openNowDot} />
                  <Text style={styles.openNowText}>{t('places.openNow')}</Text>
                </View>
              )}
              {heroPlace.user_has_checked_in && (
                <View style={styles.visitedBadge}>
                  <Text style={styles.visitedText}>✓ {t('places.visited')}</Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.heroBottom}>
            <View style={styles.heroGlass}>
              <View style={styles.heroGlassRow}>
                <View style={styles.heroGlassLeft}>
                  <Text style={styles.heroName} numberOfLines={2}>{heroPlace.name}</Text>
                  <Text style={styles.heroAddress} numberOfLines={1}>
                    {heroPlace.address || heroPlace.place_type || ''}
                  </Text>
                </View>
                {heroPlace.average_rating != null && (
                  <View style={styles.heroRatingWrap}>
                    <Text style={styles.heroRatingValue}>{heroPlace.average_rating.toFixed(1)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.heroGlassFooter}>
                {heroPlace.distance != null && (
                  <Text style={styles.heroDistance}>{formatDistance(heroPlace.distance)} away</Text>
                )}
                <Text style={styles.heroDetails}>{t('home.details')} ›</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>{t('nav.explore')}</Text>
          <Text style={styles.greeting}>{t('home.greeting')}</Text>
          <Text style={styles.title}>{displayName}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={t('home.findPlace')}
          placeholderTextColor={tokens.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsWrap}
        style={styles.chipsScroll}
      >
        {(['nearby', 'historical', 'jummah', 'events'] as const).map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, filter === key && styles.chipActive]}
            onPress={() => setFilter((f) => (f === key ? 'nearby' : key))}
          >
            <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>
              {t(`home.${key}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
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
          data={restPlaces}
          keyExtractor={(item) => item.place_code}
          ListHeaderComponent={renderHero}
          renderItem={({ item }) => <PlaceCard place={item} />}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.surfaceTint,
  },
  header: { paddingHorizontal: 24, paddingBottom: 24 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.primaryDark,
    marginBottom: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  greeting: {
    fontSize: 22,
    fontWeight: '200',
    color: tokens.colors.textSecondary,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '400',
    color: tokens.colors.textDark,
    letterSpacing: -0.5,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.inputBorder,
    paddingBottom: 12,
  },
  searchIcon: { fontSize: 20, color: tokens.colors.textMuted, marginRight: 12 },
  searchInput: { flex: 1, paddingVertical: 4, fontSize: 18, color: tokens.colors.textDark, fontWeight: '300' },
  chipsScroll: { marginBottom: 8 },
  chipsWrap: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingVertical: 8 },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: tokens.borderRadius.xl,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  chipActive: {
    backgroundColor: '#1e293b',
    borderColor: '#1e293b',
  },
  chipText: { fontSize: 14, fontWeight: '300', color: tokens.colors.textSecondary },
  chipTextActive: { color: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: tokens.colors.textSecondary },
  errorText: { fontSize: 14, color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
  emptyIcon: { fontSize: 48, color: tokens.colors.textMuted, marginBottom: 12 },
  emptyTitle: { fontSize: 16, color: tokens.colors.textSecondary, textAlign: 'center', marginBottom: 16 },
  retryButton: {
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: tokens.borderRadius.xl,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  listContent: { paddingHorizontal: 24, paddingTop: 8 },
  separator: { height: 16 },
  heroCard: {
    borderRadius: tokens.borderRadius['3xl'],
    overflow: 'hidden',
    marginBottom: 32,
    ...tokens.shadow.card,
  },
  heroImageWrap: {
    height: 320,
    backgroundColor: tokens.colors.softBlue,
    position: 'relative',
  },
  heroImage: { width: '100%', height: '100%' },
  heroImagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroPlaceholderIcon: { fontSize: 64, color: tokens.colors.textMuted },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '65%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  heroBadges: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  openNowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  openNowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.openNow,
  },
  openNowText: { color: '#fff', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  visitedBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  visitedText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  heroBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 24,
  },
  heroGlass: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: tokens.borderRadius['2xl'],
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroGlassRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  heroGlassLeft: { flex: 1, marginRight: 12 },
  heroName: { fontSize: 22, fontWeight: '600', color: '#fff', marginBottom: 4 },
  heroAddress: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '300' },
  heroRatingWrap: { alignItems: 'flex-end' },
  heroRatingValue: { fontSize: 22, fontWeight: '300', color: '#fff' },
  heroGlassFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  heroDistance: { fontSize: 12, fontWeight: '300', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' },
  heroDetails: { fontSize: 12, fontWeight: '600', color: '#fff', textTransform: 'uppercase' },
});
