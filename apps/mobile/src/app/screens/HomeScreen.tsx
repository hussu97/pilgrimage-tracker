import { useCallback, useEffect, useState, useRef } from 'react';
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
  Modal,
  Pressable,
  Image,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth, useI18n, useTheme } from '../providers';
import { useLocation } from '../contexts/LocationContext';
import { getPlaces } from '../../lib/api/client';
import type { Place } from '../../lib/types';
import type { RootStackParamList } from '../navigation';
import { tokens } from '../../lib/theme';
import PlaceCard from '../../components/PlaceCard';
import { shareUrl } from '../../lib/share';

type FilterChip = 'all' | 'mosque' | 'shrine' | 'temple';
type ViewMode = 'list' | 'map';

const FILTER_CHIPS: { key: FilterChip; labelKey: string; placeType?: string }[] = [
  { key: 'all', labelKey: 'home.filterAll' },
  { key: 'mosque', labelKey: 'home.filterMosques', placeType: 'mosque' },
  { key: 'shrine', labelKey: 'home.filterShrines', placeType: 'shrine' },
  { key: 'temple', labelKey: 'home.filterTemples', placeType: 'temple' },
];

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function buildMapHtml(places: Place[], centerLat: number, centerLng: number): string {
  const markers = places.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    name: p.name,
    placeCode: p.place_code,
    address: p.address || p.place_type || '',
  }));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    var blueIcon = L.divIcon({
      className: '',
      html: '<div style="background:#007AFF;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -36]
    });

    var markers = ${JSON.stringify(markers)};

    markers.forEach(function(m) {
      var marker = L.marker([m.lat, m.lng], { icon: blueIcon }).addTo(map);
      marker.bindPopup('<strong>' + m.name + '</strong><br/><small>' + m.address + '</small>');
      marker.on('click', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ placeCode: m.placeCode }));
        }
      });
    });

    L.circleMarker([${centerLat}, ${centerLng}], {
      radius: 8,
      fillColor: '#007AFF',
      color: '#fff',
      weight: 3,
      opacity: 1,
      fillOpacity: 1
    }).addTo(map).bindPopup('Your location');
  </script>
</body>
</html>`;
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
      color: textMain,
      letterSpacing: -0.3,
    },
    greetingName: {
      fontWeight: '700',
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
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: textMain,
      padding: 0,
    },
    chipsScroll: { marginBottom: 20 },
    chipsWrap: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 24,
      paddingVertical: 4,
    },
    chip: {
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: tokens.borderRadius.full,
      backgroundColor: chipBg,
      borderWidth: 1,
      borderColor: chipBorder,
    },
    chipActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '500',
      color: textSecondary,
    },
    chipTextActive: { color: '#fff' },
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
    countBadge: {
      position: 'absolute',
      bottom: 24,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: tokens.borderRadius.full,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    countText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    // Bottom sheet styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    bottomSheet: {
      backgroundColor: surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 12,
      shadowColor: '#94a3b8',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 4,
    },
    sheetHandle: {
      width: 32,
      height: 4,
      backgroundColor: isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 16,
    },
    sheetRow: { flexDirection: 'row', marginBottom: 20 },
    sheetThumb: {
      width: 96,
      height: 96,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: isDark ? tokens.colors.darkSurface : tokens.colors.softBlue,
    },
    sheetThumbImage: { width: 96, height: 96 },
    sheetThumbPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetInfo: { flex: 1, marginLeft: 16, minWidth: 0 },
    sheetName: {
      fontSize: 20,
      fontWeight: '700',
      color: textMain,
    },
    sheetAddress: {
      fontSize: 14,
      color: textSecondary,
      marginTop: 4,
    },
    sheetMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
    },
    sheetRating: { fontSize: 14, fontWeight: '600', color: textMain },
    sheetDistance: { fontSize: 14, color: textMuted },
    sheetOpen: { fontSize: 12, fontWeight: '600', color: tokens.colors.openNow },
    sheetActions: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    sheetDirections: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: tokens.colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
    },
    sheetDirectionsText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    sheetShare: {
      width: 48,
      backgroundColor: isDark ? tokens.colors.darkSurface : tokens.colors.blueTint,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder,
    },
    sheetDetail: {
      paddingVertical: 12,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 4,
    },
    sheetDetailText: { fontSize: 14, fontWeight: '600', color: tokens.colors.primary },
  });
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>>();
  const { user } = useAuth();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { coords } = useLocation();
  const webViewRef = useRef<WebView>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filter, setFilter] = useState<FilterChip>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [mapHtml, setMapHtml] = useState<string>('');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const styles = makeStyles(isDark);

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
      const centerLat = coords.lat ?? 21.3891;
      const centerLng = coords.lng ?? 39.8579;
      setMapHtml(buildMapHtml(data, centerLat, centerLng));
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

  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { placeCode: string };
      if (msg.placeCode) {
        const found = places.find((p) => p.place_code === msg.placeCode);
        if (found) setSelectedPlace(found);
      }
    } catch {}
  }, [places]);

  const directionsUrl = selectedPlace
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedPlace.lat + ',' + selectedPlace.lng)}`
    : '';

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || t('home.title');
  const showEmpty = !loading && !error && places.length === 0;
  const textSecondaryColor = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;
  const textMutedColor = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Background gradient tint */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.gradientTop} />
      </View>

      {/* Always-visible header area */}
      <View style={styles.headerArea}>
        {/* Header row: greeting + toggle buttons */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.label}>{t('nav.explore')}</Text>
              <Text style={styles.greeting}>
                {t('home.greeting')} <Text style={styles.greetingName}>{displayName}</Text>
              </Text>
            </View>
            {/* List / Map toggle */}
            <View style={styles.toggleGroup}>
              <TouchableOpacity
                style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
                onPress={() => setViewMode('list')}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name="format-list-bulleted"
                  size={20}
                  color={viewMode === 'list' ? '#fff' : textSecondaryColor}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
                onPress={() => setViewMode('map')}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name="map"
                  size={20}
                  color={viewMode === 'map' ? '#fff' : textSecondaryColor}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <MaterialIcons
            name="search"
            size={20}
            color={textMutedColor}
            style={styles.searchIconStyle}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={t('home.findPlace')}
            placeholderTextColor={textMutedColor}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={18} color={textMutedColor} />
            </TouchableOpacity>
          )}
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
      </View>

      {/* Conditional content area */}
      <View style={styles.contentArea}>
        {viewMode === 'list' ? (
          loading && places.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={tokens.colors.primary} />
              <Text style={styles.loadingText}>{t('home.loadingPlaces')}</Text>
            </View>
          ) : error && places.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchPlaces}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={places}
              keyExtractor={(item) => item.place_code}
              renderItem={({ item }) => <PlaceCard place={item} />}
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
                      onPress={() => setFilter('all')}
                    >
                      <Text style={styles.retryText}>{t('home.clearFilters')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + 100 },
              ]}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={fetchPlaces}
                  colors={[tokens.colors.primary]}
                />
              }
            />
          )
        ) : (
          /* Map view */
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

            {/* Place count badge */}
            {!loading && places.length > 0 && (
              <View style={styles.countBadge}>
                <MaterialIcons name="location-on" size={14} color="#fff" />
                <Text style={styles.countText}>
                  {places.length} {t('places.places') || 'places'}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Bottom sheet for selected place (map mode) */}
      <Modal visible={selectedPlace != null} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedPlace(null)}>
          <Pressable
            style={[styles.bottomSheet, { paddingBottom: insets.bottom + 24 }]}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedPlace && (
              <>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetRow}>
                  <View style={styles.sheetThumb}>
                    {selectedPlace.image_urls?.[0] ? (
                      <Image
                        source={{ uri: selectedPlace.image_urls[0] }}
                        style={styles.sheetThumbImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.sheetThumbPlaceholder}>
                        <MaterialIcons
                          name="location-on"
                          size={32}
                          color={textMutedColor}
                        />
                      </View>
                    )}
                  </View>
                  <View style={styles.sheetInfo}>
                    <Text style={styles.sheetName} numberOfLines={2}>
                      {selectedPlace.name}
                    </Text>
                    <Text style={styles.sheetAddress} numberOfLines={1}>
                      {selectedPlace.address || selectedPlace.place_type || ''}
                    </Text>
                    <View style={styles.sheetMeta}>
                      {selectedPlace.average_rating != null && (
                        <Text style={styles.sheetRating}>
                          ★ {selectedPlace.average_rating.toFixed(1)}
                        </Text>
                      )}
                      {selectedPlace.distance != null && (
                        <Text style={styles.sheetDistance}>
                          {formatDistance(selectedPlace.distance)}
                        </Text>
                      )}
                      {selectedPlace.is_open_now && (
                        <Text style={styles.sheetOpen}>{t('places.openNow')}</Text>
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.sheetActions}>
                  <TouchableOpacity
                    style={styles.sheetDirections}
                    onPress={() => directionsUrl && Linking.openURL(directionsUrl)}
                  >
                    <MaterialIcons name="directions" size={18} color="#fff" />
                    <Text style={styles.sheetDirectionsText}>
                      {t('placeDetail.directions')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.sheetShare}
                    onPress={() =>
                      shareUrl(selectedPlace.name, `places/${selectedPlace.place_code}`)
                    }
                  >
                    <MaterialIcons name="share" size={20} color={isDark ? '#fff' : tokens.colors.textMain} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.sheetDetail}
                  onPress={() => {
                    setSelectedPlace(null);
                    navigation.navigate('PlaceDetail', {
                      placeCode: selectedPlace.place_code,
                    });
                  }}
                >
                  <Text style={styles.sheetDetailText}>{t('places.detail')}</Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={16}
                    color={tokens.colors.primary}
                  />
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
