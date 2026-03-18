import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { buildMapHtml } from '@/lib/utils/mapBuilder';
import { getPlaces } from '@/lib/api/client';
import type { Place } from '@/lib/types';
import type { Religion } from '@/lib/types/users';
import { useI18n, useTheme } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import type { RootStackParamList } from '@/app/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.75);
const CARD_GAP = 12;

const RELIGION_OPTIONS: { value: Religion | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'islam', label: 'Islam' },
  { value: 'christianity', label: 'Christianity' },
  { value: 'hinduism', label: 'Hinduism' },
  { value: 'buddhism', label: 'Buddhism' },
  { value: 'sikhism', label: 'Sikhism' },
  { value: 'judaism', label: 'Judaism' },
];

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight,
    },
    webview: {
      flex: 1,
    },
    overlayTop: {
      position: 'absolute',
      left: 0,
      right: 0,
      zIndex: 10,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(30,30,40,0.92)' : 'rgba(255,255,255,0.92)',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 0.5,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: isDark ? '#ffffff' : tokens.colors.textDark,
      padding: 0,
    },
    filterChipRow: {
      paddingTop: 8,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      marginRight: 8,
      borderWidth: 0.5,
    },
    filterChipActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    filterChipInactive: {
      backgroundColor: isDark ? 'rgba(30,30,40,0.88)' : 'rgba(255,255,255,0.88)',
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    filterChipTextActive: {
      color: '#fff',
    },
    filterChipTextInactive: {
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
    },
    carouselContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    },
    carouselInner: {
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    card: {
      width: CARD_WIDTH,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#fff',
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 8,
      marginRight: CARD_GAP,
      borderWidth: 0.5,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },
    cardSelected: {
      borderColor: tokens.colors.primary,
      borderWidth: 2,
    },
    cardImage: {
      width: '100%',
      height: 120,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#e5e7eb',
    },
    cardBody: {
      padding: 10,
      gap: 2,
    },
    cardName: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#ffffff' : tokens.colors.textDark,
    },
    cardReligion: {
      fontSize: 11,
      fontWeight: '600',
      color: tokens.colors.primary,
      textTransform: 'capitalize',
    },
    cardAddress: {
      fontSize: 11,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
      marginTop: 2,
    },
    cardBtn: {
      marginTop: 8,
      backgroundColor: tokens.colors.primary,
      borderRadius: 8,
      paddingVertical: 6,
      alignItems: 'center',
    },
    cardBtnText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    loadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)',
      zIndex: 20,
    },
  });
}

export default function MapDiscoveryScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { coords } = useLocation();
  const insets = useSafeAreaInsets();
  const s = makeStyles(isDark);

  const webViewRef = useRef<WebViewType>(null);
  const carouselRef = useRef<FlatList<Place>>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [religion, setReligion] = useState<Religion | ''>('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const fetchPlaces = useCallback(async (searchVal: string, religionVal: Religion | '') => {
    setLoading(true);
    try {
      const resp = await getPlaces({
        search: searchVal || undefined,
        religions: religionVal ? [religionVal] : undefined,
        page_size: 200,
      });
      setPlaces(resp.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPlaces('', '');
  }, [fetchPlaces]);

  // Debounced search / religion filter refetch
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPlaces(search, religion);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, religion, fetchPlaces]);

  // When places update, push new markers to the existing WebView
  useEffect(() => {
    if (!webViewRef.current) return;
    const markers = places.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      name: p.name,
      placeCode: p.place_code,
      address: p.address || p.place_type || '',
      openStatus:
        p.open_status ??
        (p.is_open_now === true ? 'open' : p.is_open_now === false ? 'closed' : 'unknown'),
    }));
    webViewRef.current.injectJavaScript(
      `window.updateMarkers && window.updateMarkers(${JSON.stringify(markers)}); true;`,
    );
  }, [places]);

  // WebView message handler
  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          type: string;
          placeCode?: string;
        };
        if (msg.type === 'placeSelected' && msg.placeCode) {
          setSelectedCode(msg.placeCode);
          const idx = places.findIndex((p) => p.place_code === msg.placeCode);
          if (idx !== -1) {
            carouselRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
          }
        }
      } catch {
        // ignore parse errors
      }
    },
    [places],
  );

  const mapHtml = buildMapHtml(places, coords.lat, coords.lng, 13);

  const selectedIndex = selectedCode ? places.findIndex((p) => p.place_code === selectedCode) : -1;

  // Send recenter to WebView when coords change
  useEffect(() => {
    if (!webViewRef.current) return;
    webViewRef.current.injectJavaScript(
      `map && map.setView([${coords.lat}, ${coords.lng}], map.getZoom()); true;`,
    );
  }, [coords]);

  const renderCard = ({ item, index }: { item: Place; index: number }) => {
    const imgUrl = item.images?.[0]?.url ? getFullImageUrl(item.images[0].url) : null;
    const isSelected = item.place_code === selectedCode;
    const scaleAnim = new Animated.Value(1);

    const handlePressIn = () => {
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        useNativeDriver: true,
        speed: 30,
        bounciness: 0,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 4,
      }).start();
    };

    return (
      <Animated.View
        style={[s.card, isSelected && s.cardSelected, { transform: [{ scale: scaleAnim }] }]}
      >
        {imgUrl ? (
          <ExpoImage
            source={{ uri: imgUrl }}
            style={s.cardImage}
            contentFit="cover"
            accessibilityLabel={item.images?.[0]?.alt_text || item.name}
          />
        ) : (
          <View style={[s.cardImage, { alignItems: 'center', justifyContent: 'center' }]}>
            <MaterialIcons
              name="place"
              size={32}
              color={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
            />
          </View>
        )}
        <View style={s.cardBody}>
          <Text style={s.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={s.cardReligion}>{item.religion}</Text>
          <Text style={s.cardAddress} numberOfLines={2}>
            {item.address}
          </Text>
          <TouchableOpacity
            style={s.cardBtn}
            activeOpacity={0.8}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={() => navigation.navigate('PlaceDetail', { placeCode: item.place_code })}
          >
            <Text style={s.cardBtnText}>{t('place.viewDetails') || 'View Details'}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  const TOP_OVERLAY_TOP = insets.top + 8;
  const BOTTOM_CAROUSEL_BOTTOM = insets.bottom + 96; // above bottom bar (+24px elevated)

  return (
    <View style={s.container}>
      {/* Full-screen WebView map */}
      <WebView
        ref={webViewRef}
        style={s.webview}
        source={{ html: mapHtml }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={handleWebViewMessage}
        scrollEnabled={false}
        bounces={false}
      />

      {/* Loading overlay */}
      {loading && (
        <View style={s.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        </View>
      )}

      {/* Floating top overlay: search + religion chips */}
      <View style={[s.overlayTop, { top: TOP_OVERLAY_TOP, paddingHorizontal: 16 }]}>
        {/* Search bar */}
        <View style={s.searchRow}>
          <MaterialIcons
            name="search"
            size={20}
            color={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
          />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('search.placeholder') || 'Search sacred sites…'}
            placeholderTextColor={
              isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted
            }
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons
                name="close"
                size={18}
                color={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Religion filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterChipRow}
          contentContainerStyle={{ paddingRight: 8 }}
        >
          {RELIGION_OPTIONS.map((opt) => {
            const isActive = religion === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[s.filterChip, isActive ? s.filterChipActive : s.filterChipInactive]}
                onPress={() => setReligion(opt.value as Religion | '')}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.filterChipText,
                    isActive ? s.filterChipTextActive : s.filterChipTextInactive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Bottom place cards carousel */}
      {places.length > 0 && (
        <View style={[s.carouselContainer, { bottom: BOTTOM_CAROUSEL_BOTTOM }]}>
          <FlatList
            ref={carouselRef}
            data={places}
            keyExtractor={(item) => item.place_code}
            renderItem={renderCard}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.carouselInner}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            onScrollToIndexFailed={() => {}}
            onViewableItemsChanged={({ viewableItems }) => {
              if (viewableItems.length > 0) {
                const first = viewableItems[0].item as Place;
                if (first.place_code !== selectedCode) {
                  setSelectedCode(first.place_code);
                  // Center map on this place
                  if (webViewRef.current) {
                    webViewRef.current.injectJavaScript(
                      `map && map.setView([${first.lat}, ${first.lng}], map.getZoom()); true;`,
                    );
                  }
                }
              }
            }}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          />
        </View>
      )}
    </View>
  );
}
