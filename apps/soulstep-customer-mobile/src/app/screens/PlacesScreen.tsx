import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { getPlaces } from '@/lib/api/client';
import type { Place } from '@/lib/types';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { useTheme, useI18n } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { RootStackParamList } from '@/app/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RELIGIONS = [
  { value: '', label: 'All' },
  { value: 'islam', label: 'Islam' },
  { value: 'christianity', label: 'Christianity' },
  { value: 'hinduism', label: 'Hinduism' },
  { value: 'buddhism', label: 'Buddhism' },
  { value: 'sikhism', label: 'Sikhism' },
  { value: 'judaism', label: 'Judaism' },
  { value: 'bahai', label: "Bahá'í" },
  { value: 'zoroastrianism', label: 'Zoroastrianism' },
];

export default function PlacesScreen() {
  const navigation = useNavigation<Nav>();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const s = makeStyles(isDark);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [religion, setReligion] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPlaces = useCallback(
    async (nextCursor: string | null = null, reset = false) => {
      setLoading(true);
      try {
        const resp = await getPlaces({
          religions: religion ? [religion as any] : undefined,
          limit: 50,
          cursor: nextCursor ?? undefined,
        });
        if (reset) {
          setPlaces(resp.places);
        } else {
          setPlaces((prev) => [...prev, ...resp.places]);
        }
        setCursor(resp.next_cursor ?? null);
        setHasMore(resp.next_cursor != null);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [religion],
  );

  useEffect(() => {
    setCursor(null);
    fetchPlaces(null, true);
  }, [religion, fetchPlaces]);

  const renderPlace = ({ item }: { item: Place }) => {
    const imgUrl = item.images?.[0]?.url ? getFullImageUrl(item.images[0].url) : null;
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => navigation.push('PlaceDetail', { placeCode: item.place_code })}
        activeOpacity={0.8}
      >
        <View style={s.imgWrapper}>
          {imgUrl ? (
            <ExpoImage source={{ uri: imgUrl }} style={s.img} contentFit="cover" />
          ) : (
            <View style={[s.img, s.imgPlaceholder]}>
              <MaterialIcons name="place" size={24} color={tokens.colors.textMuted} />
            </View>
          )}
        </View>
        <View style={s.cardBody}>
          <Text style={s.placeName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={s.placeAddress} numberOfLines={1}>
            {item.address}
          </Text>
          <View style={s.meta}>
            <Text style={s.religion}>{item.religion}</Text>
            {item.average_rating != null && (
              <View style={s.ratingRow}>
                <MaterialIcons name="star" size={11} color={tokens.colors.goldRank} />
                <Text style={s.rating}>{item.average_rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.container, { paddingTop: insets.top + 12 }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.title}>{t('places.allSacredSites')}</Text>
          <Text style={s.subtitle}>{t('places.browseSubtitle')}</Text>
        </View>
      </View>

      {/* Religion filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
        style={s.chipsScroll}
      >
        {RELIGIONS.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[s.chip, religion === r.value && s.chipActive]}
            onPress={() => setReligion(r.value)}
            activeOpacity={0.8}
          >
            <Text style={[s.chipText, religion === r.value && s.chipTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && places.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator color={tokens.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.place_code}
          numColumns={2}
          columnWrapperStyle={s.row}
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 80 }]}
          renderItem={renderPlace}
          onEndReached={() => hasMore && !loading && fetchPlaces(cursor)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading ? (
              <View style={s.footer}>
                <ActivityIndicator color={tokens.colors.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 12,
    },
    backBtn: { padding: 4 },
    backIcon: {
      fontSize: 20,
      color: isDark ? '#fff' : tokens.colors.textMain,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#fff' : tokens.colors.textMain,
    },
    subtitle: {
      fontSize: 12,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
    },
    chipsScroll: { flexGrow: 0, marginBottom: 12 },
    chips: { paddingHorizontal: 16, gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: tokens.borderRadius.full,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#f1f5f9',
    },
    chipActive: { backgroundColor: tokens.colors.primary },
    chipText: {
      fontSize: 13,
      fontWeight: '500',
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
    },
    chipTextActive: { color: '#fff' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
    row: { gap: 10 },
    card: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#fff',
      borderRadius: tokens.borderRadius['2xl'],
      borderWidth: 1,
      borderColor: isDark ? tokens.colors.darkBorder : '#e5e7eb',
      overflow: 'hidden',
      ...tokens.shadow.card,
    },
    imgWrapper: { height: 120 },
    img: { width: '100%', height: '100%' },
    imgPlaceholder: {
      backgroundColor: isDark ? tokens.colors.darkBg : '#f1f5f9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { padding: 10 },
    placeName: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#fff' : tokens.colors.textMain,
      marginBottom: 2,
    },
    placeAddress: {
      fontSize: 10,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
      marginBottom: 6,
    },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    religion: {
      fontSize: 10,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
      textTransform: 'capitalize',
    },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    rating: { fontSize: 10, fontWeight: '600', color: tokens.colors.goldRank },
    footer: { padding: 20, alignItems: 'center' },
  });
}
