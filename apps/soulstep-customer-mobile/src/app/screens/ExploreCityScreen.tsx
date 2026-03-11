import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCityPlaces, getCityReligionPlaces } from '@/lib/api/client';
import { useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { RootStackParamList } from '@/app/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ExploreCity'>;

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

interface CityPlace {
  place_code: string;
  name: string;
  religion: string;
  address: string;
  seo_slug?: string;
}

export default function ExploreCityScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { citySlug } = route.params;
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const s = makeStyles(isDark);

  const [places, setPlaces] = useState<CityPlace[]>([]);
  const [cityName, setCityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [religion, setReligion] = useState('');

  useEffect(() => {
    setLoading(true);
    const fetchFn = religion ? getCityReligionPlaces(citySlug, religion) : getCityPlaces(citySlug);
    fetchFn
      .then((data) => {
        setPlaces(data.places ?? []);
        setCityName(data.city ?? '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [citySlug, religion]);

  return (
    <View style={[s.container, { paddingTop: insets.top + 12 }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>
          {cityName || citySlug}
        </Text>
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

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={tokens.colors.primary} />
        </View>
      ) : places.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyText}>No sacred sites found.</Text>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.place_code}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.placeRow}
              onPress={() =>
                navigation.push('PlaceDetail', {
                  placeCode: item.place_code,
                  slug: item.seo_slug,
                })
              }
              activeOpacity={0.8}
            >
              <View style={s.placeInfo}>
                <Text style={s.placeName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={s.placeAddress} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
              <Text style={s.placeReligion}>{item.religion}</Text>
            </TouchableOpacity>
          )}
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
    backBtn: {
      padding: 4,
    },
    backIcon: {
      fontSize: 20,
      color: isDark ? '#fff' : tokens.colors.textMain,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#fff' : tokens.colors.textMain,
    },
    chipsScroll: {
      flexGrow: 0,
      marginBottom: 12,
    },
    chips: {
      paddingHorizontal: 16,
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: tokens.borderRadius.full,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#f1f5f9',
    },
    chipActive: {
      backgroundColor: tokens.colors.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '500',
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
    },
    chipTextActive: {
      color: '#fff',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
      fontSize: 14,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 24,
      gap: 8,
    },
    placeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#fff',
      borderRadius: tokens.borderRadius.xl,
      borderWidth: 1,
      borderColor: isDark ? tokens.colors.darkBorder : '#e5e7eb',
    },
    placeInfo: {
      flex: 1,
      minWidth: 0,
    },
    placeName: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#fff' : tokens.colors.textMain,
      marginBottom: 2,
    },
    placeAddress: {
      fontSize: 11,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
    },
    placeReligion: {
      fontSize: 11,
      fontWeight: '500',
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
      textTransform: 'capitalize',
      flexShrink: 0,
    },
  });
}
