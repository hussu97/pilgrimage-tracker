import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCityPlaces } from '@/lib/api/client';
import { useTheme, useI18n } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { RootStackParamList } from '@/app/navigation';
import type { Place } from '@/lib/types';
import Constants from 'expo-constants';
import PlaceListRow from '@/components/places/PlaceListRow';

const API_BASE: string =
  Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ExploreCity'>;

interface CityPlace {
  place_code: string;
  name: string;
  religion: string;
  address: string;
  seo_slug?: string;
  images?: { url: string; alt_text?: string }[];
}

interface CityMetrics {
  checkins_30d: number | null;
  popularity_label: string | null;
}

export default function ExploreCityScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { citySlug } = route.params;
  const { isDark } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const s = makeStyles(isDark);

  const [places, setPlaces] = useState<CityPlace[]>([]);
  const [cityName, setCityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CityMetrics | null>(null);

  // Fetch city metrics (checkins_30d + popularity_label)
  useEffect(() => {
    async function loadMetrics() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/cities?page_size=100&include_metrics=true`);
        if (!res.ok) return;
        const data = await res.json();
        const cityRow = (data.items ?? []).find(
          (c: {
            city_slug: string;
            checkins_30d?: number | null;
            popularity_label?: string | null;
          }) => c.city_slug === citySlug,
        );
        if (cityRow) {
          setMetrics({
            checkins_30d: cityRow.checkins_30d ?? null,
            popularity_label: cityRow.popularity_label ?? null,
          });
        }
      } catch {
        // silently skip
      }
    }
    loadMetrics();
  }, [citySlug]);

  useEffect(() => {
    setLoading(true);
    getCityPlaces(citySlug)
      .then((data) => {
        setPlaces(data.items ?? []);
        setCityName(data.city ?? '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [citySlug]);

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

      {/* City metrics banner */}
      {metrics && (
        <View style={s.metricsBanner}>
          <View style={s.metricItem}>
            <Text style={s.metricValue}>{places.length}</Text>
            <Text style={s.metricLabel}>{t('nav.places')}</Text>
          </View>
          {metrics.checkins_30d != null && (
            <View style={s.metricItem}>
              <Text style={s.metricValue}>{metrics.checkins_30d}</Text>
              <Text style={s.metricLabel}>{t('place.checkIns') || 'Check-ins (30d)'}</Text>
            </View>
          )}
          {metrics.popularity_label && (
            <View style={[s.metricItem, s.popularityBadge]}>
              <MaterialIcons name="trending-up" size={14} color={tokens.colors.primary} />
              <Text style={s.popularityText}>{metrics.popularity_label}</Text>
            </View>
          )}
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={tokens.colors.primary} />
        </View>
      ) : places.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyText}>{t('explore.noSites')}</Text>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.place_code}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => {
            const placeObj = {
              place_code: item.place_code,
              name: item.name,
              address: item.address,
              images: item.images ?? [],
            } as unknown as Place;
            return (
              <PlaceListRow
                place={placeObj}
                t={t}
                onPress={() =>
                  navigation.push('PlaceDetail', {
                    placeCode: item.place_code,
                    slug: item.seo_slug,
                  })
                }
                rightSlot={
                  item.religion ? (
                    <Text style={s.placeReligion}>
                      {t(`common.${item.religion}`) || item.religion}
                    </Text>
                  ) : undefined
                }
              />
            );
          }}
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
    // ── Metrics banner ──
    metricsBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 14,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#ffffff',
      borderRadius: tokens.borderRadius.xl,
      borderWidth: 1,
      borderColor: isDark ? tokens.colors.darkBorder : '#e5e7eb',
      ...tokens.shadow.card,
    },
    metricItem: {
      alignItems: 'center',
      flex: 1,
    },
    metricValue: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#ffffff' : tokens.colors.textMain,
    },
    metricLabel: {
      fontSize: 10,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
      marginTop: 2,
    },
    popularityBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(176,86,61,0.15)' : 'rgba(176,86,61,0.08)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: tokens.borderRadius.full,
      flex: 0,
    },
    popularityText: {
      fontSize: 12,
      fontWeight: '700',
      color: tokens.colors.primary,
    },
    // ── Place rows ──
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
    placeThumb: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#e5e7eb',
      flexShrink: 0,
    },
    placeThumbFallback: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#f1f5f9',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
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
