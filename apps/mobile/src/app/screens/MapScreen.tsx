import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
  Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useAuth } from '../providers';
import { useI18n } from '../providers';
import { useLocation } from '../contexts/LocationContext';
import { getPlaces } from '../../lib/api/client';
import { shareUrl, openDirections } from '../../lib/share';
import type { Place } from '../../lib/types';
import { tokens } from '../../lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>;

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

    // Also add a circle for the user's position
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

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { t } = useI18n();
  const { coords } = useLocation();
  const webViewRef = useRef<WebView>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [mapHtml, setMapHtml] = useState<string>('');

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPlaces({
        religions: user?.religions?.length ? user.religions : undefined,
        search: searchDebounced || undefined,
        sort: 'distance' as const,
        limit: 50,
        lat: coords.lat,
        lng: coords.lng,
      });
      setPlaces(data);
      // Use user location or fallback to Mecca as spiritual default
      const centerLat = coords.lat ?? 21.3891;
      const centerLng = coords.lng ?? 39.8579;
      setMapHtml(buildMapHtml(data, centerLat, centerLng));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [user?.religions, coords, searchDebounced, t]);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  // Handle messages from the WebView (marker taps)
  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { placeCode: string };
      if (msg.placeCode) {
        const found = places.find((p) => p.place_code === msg.placeCode);
        if (found) setSelectedPlace(found);
      }
    } catch {}
  }, [places]);

  const handleDirections = () => {
    if (selectedPlace) openDirections(selectedPlace.lat, selectedPlace.lng, selectedPlace.name);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search overlay */}
      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={20} color={tokens.colors.textMuted} style={styles.searchIconStyle} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('home.findPlace')}
          placeholderTextColor={tokens.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialIcons name="close" size={18} color={tokens.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Map or loading/error state */}
      {loading && places.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <MaterialIcons name="map" size={48} color={tokens.colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchPlaces}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : mapHtml ? (
        <WebView
          ref={webViewRef}
          style={styles.map}
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
          <Text style={styles.countText}>{places.length} {t('places.places') || 'places'}</Text>
        </View>
      )}

      {/* Bottom sheet for selected place */}
      <Modal visible={selectedPlace != null} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedPlace(null)}>
          <Pressable style={[styles.bottomSheet, { paddingBottom: insets.bottom + 24 }]} onPress={(e) => e.stopPropagation()}>
            {selectedPlace && (
              <>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetCard}>
                  <View style={styles.sheetRow}>
                    <View style={styles.sheetThumb}>
                      {selectedPlace.image_urls?.[0] ? (
                        <Image source={{ uri: selectedPlace.image_urls[0] }} style={styles.sheetThumbImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.sheetThumbPlaceholder}>
                          <MaterialIcons name="location-on" size={32} color={tokens.colors.textMuted} />
                        </View>
                      )}
                    </View>
                    <View style={styles.sheetInfo}>
                      <Text style={styles.sheetName} numberOfLines={2}>{selectedPlace.name}</Text>
                      <Text style={styles.sheetAddress} numberOfLines={1}>{selectedPlace.address || selectedPlace.place_type || ''}</Text>
                      <View style={styles.sheetMeta}>
                        {selectedPlace.average_rating != null && (
                          <Text style={styles.sheetRating}>★ {selectedPlace.average_rating.toFixed(1)}</Text>
                        )}
                        {selectedPlace.distance != null && (
                          <Text style={styles.sheetDistance}>{formatDistance(selectedPlace.distance)}</Text>
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
                      onPress={handleDirections}
                    >
                      <MaterialIcons name="directions" size={18} color="#fff" />
                      <Text style={styles.sheetDirectionsText}>{t('placeDetail.directions')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sheetShare}
                      onPress={() => shareUrl(selectedPlace.name, `places/${selectedPlace.place_code}`)}
                    >
                      <MaterialIcons name="share" size={20} color={tokens.colors.textMain} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.sheetDetail}
                    onPress={() => {
                      setSelectedPlace(null);
                      navigation.navigate('PlaceDetail', { placeCode: selectedPlace.place_code });
                    }}
                  >
                    <Text style={styles.sheetDetailText}>{t('places.detail')}</Text>
                    <MaterialIcons name="chevron-right" size={16} color={tokens.colors.primary} />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.backgroundLight },
  map: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: tokens.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    zIndex: 10,
    ...tokens.shadow.card,
  },
  searchIconStyle: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 2, fontSize: 15, color: tokens.colors.textMain },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { marginTop: 12, fontSize: 14, color: tokens.colors.textMuted },
  errorText: { marginTop: 12, fontSize: 14, color: '#b91c1c', textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: tokens.borderRadius.xl,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  countBadge: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.borderRadius.full,
    ...tokens.shadow.card,
  },
  countText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    ...tokens.shadow.elevated,
  },
  sheetHandle: {
    width: 32,
    height: 4,
    backgroundColor: tokens.colors.inputBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetCard: {},
  sheetRow: { flexDirection: 'row', marginBottom: 20 },
  sheetThumb: { width: 96, height: 96, borderRadius: 16, overflow: 'hidden', backgroundColor: tokens.colors.softBlue },
  sheetThumbImage: { width: 96, height: 96 },
  sheetThumbPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  sheetInfo: { flex: 1, marginLeft: 16, minWidth: 0 },
  sheetName: { fontSize: 20, fontWeight: '700', color: tokens.colors.textMain },
  sheetAddress: { fontSize: 14, color: tokens.colors.textSecondary, marginTop: 4 },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  sheetRating: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMain },
  sheetDistance: { fontSize: 14, color: tokens.colors.textMuted },
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
    backgroundColor: tokens.colors.blueTint,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
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
