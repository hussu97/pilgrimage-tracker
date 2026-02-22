import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth, useI18n, useTheme, useSearch } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { getPlaces } from '@/lib/api/client';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import type { Place, FilterOption } from '@/lib/types';
import type { RootStackParamList } from '@/app/navigation';
import { tokens } from '@/lib/theme';
import PlaceCard from '@/components/places/PlaceCard';
import SkeletonCard from '@/components/common/SkeletonCard';
import HomeHeader from '@/components/places/HomeHeader';
import UpdateBanner from '@/components/common/UpdateBanner';
import { buildMapHtml } from '@/lib/utils/mapBuilder';

type ViewMode = 'list' | 'map';

const PAGE_SIZE = 20;
const SCREEN_HEIGHT = Dimensions.get('window').height;
// Sheet overlays the bottom portion of the map — small enough that most of the map stays visible
const MAP_SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.28);

interface ActiveFilters {
  placeType?: string;
  openNow?: boolean;
  hasParking?: boolean;
  womensArea?: boolean;
  hasEvents?: boolean;
  topRated?: boolean;
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : '#F0F7FF';
  const surface = isDark ? tokens.colors.darkSurface : '#ffffff';
  const border = isDark ? tokens.colors.darkBorder : 'rgba(0,0,0,0.05)';
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const chipBg = isDark ? tokens.colors.darkSurface : '#ffffff';
  const chipBorder = isDark ? tokens.colors.darkBorder : '#E2E8F0';
  const toggleGroupBg = isDark ? tokens.colors.darkSurface : '#f1f5f9';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: bg,
    },
    gradientTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 300,
      backgroundColor: isDark ? '#1a1a2e' : '#EBF5FF',
      opacity: 0.7,
    },
    headerArea: {
      backgroundColor: 'transparent',
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 16,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    greeting: {
      fontSize: 28,
      fontWeight: '700',
      color: textMain,
      letterSpacing: -1,
    },
    greetingName: {
      color: tokens.colors.primary,
    },
    toggleGroup: {
      flexDirection: 'row',
      backgroundColor: toggleGroupBg,
      borderRadius: tokens.borderRadius.xl,
      padding: 4,
      gap: 4,
    },
    toggleBtn: {
      width: 36,
      height: 36,
      borderRadius: tokens.borderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleBtnActive: {
      backgroundColor: tokens.colors.primary,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 24,
      marginBottom: 16,
      backgroundColor: surface,
      borderRadius: tokens.borderRadius['2xl'],
      paddingHorizontal: 16,
      paddingVertical: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.06,
      shadowRadius: 8,
      elevation: 2,
      borderWidth: 1,
      borderColor: border,
    },
    searchIconStyle: { marginRight: 10 },
    searchBarBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: textMain,
      padding: 0,
    },
    contentArea: {
      flex: 1,
    },
    mapContainer: {
      flex: 1,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
      minHeight: 200,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: textSecondary,
    },
    errorText: {
      fontSize: 14,
      color: '#b91c1c',
      textAlign: 'center',
      marginBottom: 12,
    },
    emptyIcon: { marginBottom: 12 },
    emptyTitle: {
      fontSize: 16,
      color: textSecondary,
      textAlign: 'center',
      marginBottom: 16,
    },
    retryButton: {
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: tokens.borderRadius.xl,
    },
    retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    listContent: { paddingHorizontal: 24, paddingTop: 4 },
    separator: { height: 16 },
    // Filter icon in search bar
    filterIconBtn: {
      padding: 6,
      borderRadius: 8,
      marginLeft: 2,
    },
    filterIconBtnActive: {
      backgroundColor: isDark ? '#1e2a3e' : tokens.colors.blueTint,
    },
    filterDot: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: tokens.colors.primary,
    },
    // Filter sheet
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    filterSheet: {
      backgroundColor: surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    filterSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    filterSheetTitle: { fontSize: 18, fontWeight: '700', color: textMain },
    filterClearAll: { fontSize: 14, color: tokens.colors.primary, fontWeight: '600' },
    filterSectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 4,
    },
    filterChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: tokens.borderRadius.full,
      backgroundColor: chipBg,
      borderWidth: 1,
      borderColor: chipBorder,
    },
    filterChipActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    filterChipText: { fontSize: 13, fontWeight: '500', color: textMain },
    filterChipTextActive: { color: '#fff', fontWeight: '600' },
    applyFiltersBtn: {
      backgroundColor: tokens.colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 8,
    },
    applyFiltersBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    // Map bottom sheet — absolute overlay, does not shrink the map
    mapSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      // bottom and height applied inline (depend on tabBarHeight and MAP_SHEET_HEIGHT)
      backgroundColor: surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0.3 : 0.12,
      shadowRadius: 16,
      elevation: 8,
      borderTopWidth: 1,
      borderTopColor: border,
    },
    mapSheetHandle: {
      width: 32,
      height: 4,
      backgroundColor: isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 8,
    },
    mapSheetHeader: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    mapSheetCount: {
      fontSize: 13,
      fontWeight: '600',
      color: textSecondary,
    },
    mapSheetList: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 8,
    },
  });
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>>();
  const { user } = useAuth();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { coords } = useLocation();
  const { searchLocation, setSearchLocation } = useSearch();
  const webViewRef = useRef<WebView>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [pendingFilters, setPendingFilters] = useState<ActiveFilters>({});
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [mapHtml, setMapHtml] = useState<string>('');
  const [visiblePlaceCodes, setVisiblePlaceCodes] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const buildParams = useCallback(
    (cursor: string | null) => ({
      religions: (() => {
        const r = user?.religions ?? [];
        if (!r.length || r.includes('all')) return undefined;
        return r;
      })(),
      sort: 'distance' as const,
      limit: PAGE_SIZE,
      cursor: cursor ?? undefined,
      lat: searchLocation ? searchLocation.lat : coords.lat,
      lng: searchLocation ? searchLocation.lng : coords.lng,
      radius: searchLocation ? 10 : undefined,
      place_type: activeFilters.placeType,
      open_now: activeFilters.openNow,
      has_parking: activeFilters.hasParking,
      womens_area: activeFilters.womensArea,
      has_events: activeFilters.hasEvents,
      top_rated: activeFilters.topRated,
    }),
    [user?.religions, activeFilters, coords, searchLocation],
  );

  // Initial / refresh fetch — resets pagination
  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    setHasMore(true);
    try {
      const data = await getPlaces(buildParams(null));
      setPlaces(data.places);
      setNextCursor(data.next_cursor ?? null);
      setHasMore(data.next_cursor != null);
      setFilterOptions(data.filters?.options ?? []);
      const centerLat = (searchLocation ? searchLocation.lat : coords.lat) ?? 21.3891;
      const centerLng = (searchLocation ? searchLocation.lng : coords.lng) ?? 39.8579;
      setMapHtml(buildMapHtml(data.places, centerLat, centerLng));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [buildParams, coords, t]);

  // Load next page — appends to list
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await getPlaces(buildParams(nextCursor));
      if (data.places.length > 0) {
        setPlaces((prev) => [...prev, ...data.places]);
        setNextCursor(data.next_cursor ?? null);
      }
      setHasMore(data.next_cursor != null);
    } catch {
      // silently skip — user can scroll again
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, buildParams, nextCursor]);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          north?: number;
          south?: number;
          east?: number;
          west?: number;
        };
        if (msg.type === 'boundsChanged' && msg.north != null) {
          const { north, south, east, west } = msg;
          setVisiblePlaceCodes(
            new Set(
              places
                .filter(
                  (p) =>
                    p.lat >= (south ?? -90) &&
                    p.lat <= (north ?? 90) &&
                    p.lng >= (west ?? -180) &&
                    p.lng <= (east ?? 180),
                )
                .map((p) => p.place_code),
            ),
          );
        }
      } catch {}
    },
    [places],
  );

  const visiblePlaces = useMemo(
    () => places.filter((p) => visiblePlaceCodes.has(p.place_code)),
    [places, visiblePlaceCodes],
  );

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || t('home.title');
  const showEmpty = !loading && !error && places.length === 0;
  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  const textSecondaryColor = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;
  const textMutedColor = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Background gradient tint */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.gradientTop} />
      </View>

      {/* Soft update banner */}
      <UpdateBanner />

      {/* Always-visible header area */}
      <View style={styles.headerArea}>
        <HomeHeader
          displayName={displayName}
          viewMode={viewMode}
          onViewModeToggle={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
          isDark={isDark}
          t={t}
        />
        {/* Pressable search bar — opens SearchScreen */}
        <View style={styles.searchWrap}>
          <TouchableOpacity
            style={[styles.searchBarBtn, { flex: 1 }]}
            onPress={() => navigation.navigate('Search')}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="search"
              size={20}
              color={textMutedColor}
              style={styles.searchIconStyle}
            />
            {searchLocation ? (
              <Text
                style={[
                  styles.searchInput,
                  { color: isDark ? '#fff' : tokens.colors.textDark, flex: 1 },
                ]}
                numberOfLines={1}
              >
                {searchLocation.name}
              </Text>
            ) : (
              <Text
                style={[styles.searchInput, { color: textMutedColor, flex: 1 }]}
                numberOfLines={1}
              >
                {t('search.searchPlaces')}
              </Text>
            )}
            {searchLocation && (
              <TouchableOpacity
                onPress={() => setSearchLocation(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={18} color={textMutedColor} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setPendingFilters(activeFilters);
              setFilterSheetOpen(true);
            }}
            style={[styles.filterIconBtn, hasActiveFilters && styles.filterIconBtnActive]}
          >
            <MaterialIcons
              name="tune"
              size={20}
              color={hasActiveFilters ? tokens.colors.primary : textMutedColor}
            />
            {hasActiveFilters && <View style={styles.filterDot} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Conditional content area */}
      <View style={styles.contentArea}>
        {viewMode === 'list' ? (
          error && places.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchPlaces}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={
                loading && places.length === 0
                  ? (Array.from({ length: 5 }, (_, i) => ({ place_code: `skel-${i}` })) as any)
                  : places
              }
              keyExtractor={(item) => item.place_code}
              renderItem={({ item, index }) =>
                String(item.place_code).startsWith('skel-') ? (
                  <SkeletonCard isDark={isDark} />
                ) : (
                  <PlaceCard place={item} isActive={index === activeIndex} />
                )
              }
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              ListEmptyComponent={
                showEmpty ? (
                  <View style={styles.centered}>
                    <MaterialIcons
                      name="location-off"
                      size={48}
                      color={textMutedColor}
                      style={styles.emptyIcon}
                    />
                    <Text style={styles.emptyTitle}>{t('home.noPlacesFound')}</Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => setActiveFilters({})}
                    >
                      <Text style={styles.retryText}>{t('home.clearFilters')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator
                    size="small"
                    color={tokens.colors.primary}
                    style={{ marginVertical: 16 }}
                  />
                ) : null
              }
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              onEndReached={loadMore}
              onEndReachedThreshold={0.4}
              refreshControl={
                <RefreshControl
                  refreshing={loading && places.length > 0}
                  onRefresh={fetchPlaces}
                  colors={[tokens.colors.primary]}
                  tintColor={tokens.colors.primary}
                />
              }
            />
          )
        ) : (
          /* Map view — map is full size, sheet overlays it */
          <View style={styles.mapContainer}>
            {loading && places.length === 0 ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={tokens.colors.primary} />
                <Text style={styles.loadingText}>{t('common.loading')}</Text>
              </View>
            ) : error && places.length === 0 ? (
              <View style={styles.centered}>
                <MaterialIcons name="map" size={48} color={textMutedColor} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={fetchPlaces}>
                  <Text style={styles.retryText}>{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : mapHtml ? (
              <WebView
                ref={webViewRef}
                style={StyleSheet.absoluteFill}
                source={{ html: mapHtml }}
                onMessage={handleWebViewMessage}
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={['*']}
                mixedContentMode="always"
                scrollEnabled={false}
              />
            ) : null}

            {/* Bottom sheet overlay — only shown when places are visible */}
            {visiblePlaces.length > 0 && (
              <View
                style={[styles.mapSheet, { bottom: tabBarHeight, height: MAP_SHEET_HEIGHT }]}
                pointerEvents="box-none"
              >
                <View pointerEvents="auto" style={StyleSheet.absoluteFill}>
                  <View style={styles.mapSheetHandle} />
                  <View style={styles.mapSheetHeader}>
                    <Text style={styles.mapSheetCount}>
                      {t('map.placesInView').replace('{count}', String(visiblePlaces.length))}
                    </Text>
                  </View>
                  <FlatList
                    data={visiblePlaces}
                    keyExtractor={(p) => p.place_code}
                    renderItem={({ item }) => <PlaceCard place={item} compact />}
                    contentContainerStyle={styles.mapSheetList}
                    ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                    showsVerticalScrollIndicator={false}
                  />
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Filter bottom sheet */}
      <Modal visible={filterSheetOpen} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setFilterSheetOpen(false)}>
          <Pressable
            style={[styles.filterSheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterSheetTitle}>{t('home.filters')}</Text>
              <TouchableOpacity onPress={() => setPendingFilters({})}>
                <Text style={styles.filterClearAll}>{t('home.clearAll')}</Text>
              </TouchableOpacity>
            </View>

            {/* Place type */}
            <Text style={styles.filterSectionLabel}>{t('home.filterType')}</Text>
            <View style={styles.filterChipsRow}>
              {(['mosque', 'shrine', 'temple'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.filterChip,
                    pendingFilters.placeType === type && styles.filterChipActive,
                  ]}
                  onPress={() =>
                    setPendingFilters((f) => ({
                      ...f,
                      placeType: f.placeType === type ? undefined : type,
                    }))
                  }
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      pendingFilters.placeType === type && styles.filterChipTextActive,
                    ]}
                  >
                    {t(`home.filter_${type}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Feature filters from backend */}
            <Text style={styles.filterSectionLabel}>{t('home.filterFeatures')}</Text>
            <View style={styles.filterChipsRow}>
              {filterOptions.map((opt) => {
                const key = toCamel(opt.key) as keyof ActiveFilters;
                const isActive = Boolean((pendingFilters as Record<string, unknown>)[key]);
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() =>
                      setPendingFilters((f) => ({ ...f, [key]: isActive ? undefined : true }))
                    }
                    activeOpacity={0.75}
                  >
                    <MaterialIcons
                      name={opt.icon as any}
                      size={14}
                      color={isActive ? '#fff' : textMutedColor}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                      {opt.label} ({opt.count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.applyFiltersBtn}
              onPress={() => {
                setActiveFilters(pendingFilters);
                setFilterSheetOpen(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.applyFiltersBtnText}>{t('home.applyFilters')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
