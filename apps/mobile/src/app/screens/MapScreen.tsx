import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
  Linking,
  Pressable,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useAuth } from '../providers';
import { useI18n } from '../providers';
import { useLocation } from '../contexts/LocationContext';
import { getPlaces } from '../../lib/api/client';
import { shareUrl } from '../../lib/share';
import type { Place } from '../../lib/types';
import { tokens } from '../../lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>;

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { t } = useI18n();
  const { coords } = useLocation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

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

  const directionsUrl = selectedPlace
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedPlace.lat + ',' + selectedPlace.lng)}`
    : '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('nav.map')}</Text>
        <Text style={styles.subtitle}>{t('home.findPlace')}</Text>
        {loading && places.length === 0 && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={tokens.colors.primary} />
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </View>
        )}
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !loading && places.length === 0 ? (
          <Text style={styles.muted}>{t('home.noPlacesFound')}</Text>
        ) : !loading ? (
          <View style={styles.list}>
            {places.map((place) => (
              <TouchableOpacity
                key={place.place_code}
                style={styles.cardWrap}
                onPress={() => setSelectedPlace(place)}
                activeOpacity={0.8}
              >
                <View style={styles.placeRow}>
                  <View style={styles.placeThumb}>
                    {place.image_urls?.[0] ? (
                      <Image source={{ uri: place.image_urls[0] }} style={styles.placeThumbImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.placeThumbPlaceholder}>
                        <Text style={styles.placeThumbIcon}>⊕</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.placeInfo}>
                    <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
                    <Text style={styles.placeAddress} numberOfLines={1}>{place.address || place.place_type || ''}</Text>
                    <View style={styles.placeMeta}>
                      {place.average_rating != null && <Text style={styles.placeRating}>★ {place.average_rating.toFixed(1)}</Text>}
                      {place.distance != null && <Text style={styles.placeDistance}>{formatDistance(place.distance)}</Text>}
                      {place.is_open_now && <Text style={styles.placeOpen}>{t('places.openNow')}</Text>}
                    </View>
                  </View>
                  <Text style={styles.placeChevron}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>

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
                        <View style={styles.sheetThumbPlaceholder}><Text style={styles.sheetThumbIcon}>⊕</Text></View>
                      )}
                    </View>
                    <View style={styles.sheetInfo}>
                      <Text style={styles.sheetName} numberOfLines={2}>{selectedPlace.name}</Text>
                      <Text style={styles.sheetAddress} numberOfLines={1}>{selectedPlace.address || selectedPlace.place_type || ''}</Text>
                      <View style={styles.sheetMeta}>
                        {selectedPlace.average_rating != null && <Text style={styles.sheetRating}>★ {selectedPlace.average_rating.toFixed(1)}</Text>}
                        {selectedPlace.distance != null && <Text style={styles.sheetDistance}>{formatDistance(selectedPlace.distance)}</Text>}
                        {selectedPlace.is_open_now && <Text style={styles.sheetOpen}>{t('places.openNow')}</Text>}
                      </View>
                    </View>
                  </View>
                  <View style={styles.sheetActions}>
                    <TouchableOpacity style={styles.sheetDirections} onPress={() => directionsUrl && Linking.openURL(directionsUrl)}>
                      <Text style={styles.sheetDirectionsText}>{t('placeDetail.directions')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetShare} onPress={() => shareUrl(selectedPlace.name, `places/${selectedPlace.place_code}`)}>
                      <Text style={styles.sheetShareText}>⎘</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.sheetDetail} onPress={() => { setSelectedPlace(null); navigation.navigate('PlaceDetail', { placeCode: selectedPlace.place_code }); }}>
                    <Text style={styles.sheetDetailText}>{t('places.detail')}</Text>
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: tokens.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    ...tokens.shadow.subtle,
  },
  searchIcon: { fontSize: 18, color: tokens.colors.textMuted, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 4, fontSize: 16, color: tokens.colors.textMain },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24 },
  title: { fontSize: 24, fontWeight: '600', color: tokens.colors.textMain, marginBottom: 4 },
  subtitle: { fontSize: 14, color: tokens.colors.textSecondary, marginBottom: 24 },
  loading: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { marginTop: 12, fontSize: 14, color: tokens.colors.textMuted },
  error: { color: '#b91c1c', marginTop: 8 },
  muted: { color: tokens.colors.textMuted, marginTop: 24 },
  list: { gap: 12 },
  cardWrap: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.borderRadius['2xl'],
    padding: 16,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    ...tokens.shadow.subtle,
  },
  placeRow: { flexDirection: 'row', alignItems: 'center' },
  placeThumb: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.colors.softBlue },
  placeThumbImage: { width: 56, height: 56 },
  placeThumbPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  placeThumbIcon: { fontSize: 24, color: tokens.colors.textMuted },
  placeInfo: { flex: 1, marginLeft: 12, minWidth: 0 },
  placeName: { fontSize: 16, fontWeight: '600', color: tokens.colors.textMain },
  placeAddress: { fontSize: 13, color: tokens.colors.textSecondary, marginTop: 2 },
  placeMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  placeRating: { fontSize: 12, fontWeight: '600', color: tokens.colors.textMain },
  placeDistance: { fontSize: 12, color: tokens.colors.textMuted },
  placeOpen: { fontSize: 11, fontWeight: '600', color: tokens.colors.openNow },
  placeChevron: { fontSize: 20, color: tokens.colors.textMuted, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    ...tokens.shadow.elevated,
  },
  sheetHandle: { width: 32, height: 4, backgroundColor: tokens.colors.inputBorder, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetCard: {},
  sheetRow: { flexDirection: 'row', marginBottom: 20 },
  sheetThumb: { width: 96, height: 96, borderRadius: 16, overflow: 'hidden', backgroundColor: tokens.colors.softBlue },
  sheetThumbImage: { width: 96, height: 96 },
  sheetThumbPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  sheetThumbIcon: { fontSize: 32, color: tokens.colors.textMuted },
  sheetInfo: { flex: 1, marginLeft: 16, minWidth: 0 },
  sheetName: { fontSize: 20, fontWeight: '700', color: tokens.colors.textMain },
  sheetAddress: { fontSize: 14, color: tokens.colors.textSecondary, marginTop: 4 },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  sheetRating: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMain },
  sheetDistance: { fontSize: 14, color: tokens.colors.textMuted },
  sheetOpen: { fontSize: 12, fontWeight: '600', color: tokens.colors.openNow },
  sheetActions: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  sheetDirections: { flex: 1, backgroundColor: tokens.colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetDirectionsText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sheetShare: { width: 48, backgroundColor: tokens.colors.blueTint, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tokens.colors.inputBorder },
  sheetShareText: { fontSize: 18, color: tokens.colors.textMain },
  sheetDetail: { paddingVertical: 12, alignItems: 'center' },
  sheetDetailText: { fontSize: 14, fontWeight: '600', color: tokens.colors.primary },
});
