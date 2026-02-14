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

type ViewMode = 'list' | 'map';
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
  const [viewMode, setViewMode] = useState<ViewMode>('list');

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

  // When map mode is selected, navigate to the Map tab
  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'map') {
      (navigation as unknown as NativeStackNavigationProp<RootStackParamList>).navigate('Map' as never);
    } else {
      setViewMode('list');
    }
  };

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || t('home.title');
  const heroPlace = places.length > 0 ? places[0] : null;
  const secondaryPlace = places.length > 1 ? places[1] : null;
  const restPlaces = places.slice(2);
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
                    <Text style={styles.heroRatingStars}>★★★★★</Text>
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

  const renderSecondaryCard = () => {
    if (!secondaryPlace) return null;
    return (
      <TouchableOpacity
        style={styles.secondaryCard}
        onPress={() => navigation.navigate('PlaceDetail', { placeCode: secondaryPlace.place_code })}
        activeOpacity={0.95}
      >
        <View style={styles.secondaryImageWrap}>
          {secondaryPlace.image_urls?.[0] ? (
            <Image source={{ uri: secondaryPlace.image_urls[0] }} style={styles.secondaryImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroImagePlaceholder}>
              <Text style={styles.heroPlaceholderIcon}>⊕</Text>
            </View>
          )}
          <View style={styles.secondaryOverlay} pointerEvents="none" />
          {secondaryPlace.is_open_now && (
            <View style={[styles.heroBadges, { justifyContent: 'flex-start' }]}>
              <View style={styles.openNowBadge}>
                <View style={styles.openNowDot} />
                <Text style={styles.openNowText}>{t('places.openNow')}</Text>
              </View>
            </View>
          )}
          {secondaryPlace.user_has_checked_in && (
            <View style={[styles.heroBadges, { justifyContent: 'flex-end' }]}>
              <View style={styles.visitedBadge}>
                <Text style={styles.visitedText}>✓ {t('places.visited')}</Text>
              </View>
            </View>
          )}
          <View style={styles.heroBottom}>
            <View style={styles.heroGlass}>
              <View style={[styles.heroGlassRow, { alignItems: 'flex-start', marginBottom: 16 }]}>
                <View style={styles.heroGlassLeft}>
                  <Text style={styles.secondaryName} numberOfLines={1}>{secondaryPlace.name}</Text>
                  <Text style={styles.heroAddress} numberOfLines={1}>
                    {secondaryPlace.address || secondaryPlace.place_type || ''}
                  </Text>
                </View>
                {secondaryPlace.distance != null && (
                  <View style={styles.distanceBadge}>
                    <Text style={styles.distanceBadgeText}>{formatDistance(secondaryPlace.distance)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.secondaryCtas}>
                <TouchableOpacity
                  style={styles.checkInBtn}
                  onPress={() => navigation.navigate('CheckIn' as never, { placeCode: secondaryPlace.place_code } as never)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.checkInBtnText}>{t('places.checkIn')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bookmarkBtn} activeOpacity={0.8}>
                  <Text style={styles.bookmarkBtnIcon}>🔖</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListHeader = () => (
    <>
      {renderHero()}
      {renderSecondaryCard()}
      {restPlaces.length > 0 && <View style={styles.separator} />}
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Gradient background (top tint fading to white) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.gradientTop} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.label}>{t('nav.explore')}</Text>
            <Text style={styles.greeting}>{t('home.greeting')}</Text>
            <Text style={styles.title}>{displayName}</Text>
          </View>
          {/* List / Map toggle */}
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
              onPress={() => handleViewModeChange('list')}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleIcon, viewMode === 'list' && styles.toggleIconActive]}>☰</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
              onPress={() => handleViewModeChange('map')}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleIcon, viewMode === 'map' && styles.toggleIconActive]}>⊞</Text>
            </TouchableOpacity>
          </View>
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
        <Text style={styles.tuneIcon}>⚙</Text>
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
          ListHeaderComponent={renderListHeader}
          renderItem={({ item }) => <PlaceCard place={item} compact />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          ItemSeparatorComponent={() => <View style={styles.compactSeparator} />}
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
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: '#F0F7FF',
    opacity: 0.6,
  },
  header: { paddingHorizontal: 24, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 9999,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: tokens.colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleIcon: { fontSize: 16, color: tokens.colors.textMuted },
  toggleIconActive: { color: '#fff' },
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
  tuneIcon: { fontSize: 18, color: tokens.colors.textMuted, marginLeft: 8 },
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
  compactSeparator: { height: 12 },
  // Hero card
  heroCard: {
    borderRadius: tokens.borderRadius['3xl'],
    overflow: 'hidden',
    marginBottom: 16,
    ...tokens.shadow.card,
  },
  heroImageWrap: {
    height: 420,
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
    top: 0,
    bottom: 0,
    // Simulated gradient: transparent top → dark bottom
    backgroundColor: 'transparent',
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
    // Dark overlay at bottom from heroOverlay is simulated via the image gradient
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 0,
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
  heroRatingStars: { fontSize: 10, color: '#fbbf24', marginTop: 2 },
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
  // Secondary card
  secondaryCard: {
    borderRadius: tokens.borderRadius['3xl'],
    overflow: 'hidden',
    marginBottom: 16,
    ...tokens.shadow.card,
  },
  secondaryImageWrap: {
    height: 280,
    backgroundColor: tokens.colors.softBlue,
    position: 'relative',
  },
  secondaryImage: { width: '100%', height: '100%' },
  secondaryOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.0)',
  },
  secondaryName: { fontSize: 20, fontWeight: '600', color: '#fff', marginBottom: 4 },
  distanceBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  distanceBadgeText: { fontSize: 12, color: '#fff', fontWeight: '300' },
  secondaryCtas: { flexDirection: 'row', gap: 12 },
  checkInBtn: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderRadius: tokens.borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  checkInBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  bookmarkBtn: {
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: tokens.borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkBtnIcon: { fontSize: 18 },
});
