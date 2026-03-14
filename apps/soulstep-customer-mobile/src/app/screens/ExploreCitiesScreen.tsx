import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCities } from '@/lib/api/client';
import { useTheme, useI18n } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { RootStackParamList } from '@/app/navigation';

const PAGE_SIZE = 24;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 10) / 2; // 2 columns, 16 padding each side, 10 gap

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface City {
  city: string;
  city_slug: string;
  count: number;
  top_images: string[];
  translations?: Record<string, string> | null;
}

function CityCollageCard({
  city,
  onPress,
  locale,
}: {
  city: City;
  onPress: () => void;
  locale: string;
}) {
  const images = city.top_images ?? [];

  const renderImages = () => {
    if (images.length === 0) {
      return (
        <View style={styles.collageFallback}>
          <Text style={styles.fallbackIcon}>🏛️</Text>
        </View>
      );
    }
    if (images.length === 1) {
      return (
        <Image source={{ uri: images[0] }} style={styles.collageFullImage} resizeMode="cover" />
      );
    }
    if (images.length === 2) {
      return (
        <View style={styles.collageRow}>
          <Image source={{ uri: images[0] }} style={styles.collageHalf} resizeMode="cover" />
          <View style={styles.collageSpacer} />
          <Image source={{ uri: images[1] }} style={styles.collageHalf} resizeMode="cover" />
        </View>
      );
    }
    return (
      <View style={styles.collageRow}>
        <Image source={{ uri: images[0] }} style={styles.collageHalf} resizeMode="cover" />
        <View style={styles.collageSpacer} />
        <View style={styles.collageRight}>
          <Image source={{ uri: images[1] }} style={styles.collageQuarter} resizeMode="cover" />
          <View style={styles.collageSpacer} />
          <Image source={{ uri: images[2] }} style={styles.collageQuarter} resizeMode="cover" />
        </View>
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[styles.card, { width: CARD_WIDTH }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardInner}>{renderImages()}</View>
      {/* Gradient-like overlay using a dark view */}
      <View style={styles.cardOverlay} />
      <View style={styles.cardTextArea}>
        <Text style={styles.cardCityName} numberOfLines={1}>
          {city.translations?.[locale] || city.city}
        </Text>
        <Text style={styles.cardSiteCount}>
          {city.count} {city.count === 1 ? 'site' : 'sites'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ExploreCitiesScreen() {
  const navigation = useNavigation<Nav>();
  const { isDark } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCities = useCallback(async (currentOffset: number, append: boolean) => {
    if (currentOffset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await getCities({
        limit: PAGE_SIZE,
        offset: currentOffset,
        include_images: true,
      });
      const fetched = data.cities ?? [];
      setCities((prev) => (append ? [...prev, ...fetched] : fetched));
      setHasMore(currentOffset + fetched.length < (data.total ?? 0));
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchCities(0, false);
  }, [fetchCities]);

  const handleEndReached = useCallback(() => {
    if (!hasMore || loadingMore || loading || search) return;
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchCities(nextOffset, true);
  }, [hasMore, loadingMore, loading, search, offset, fetchCities]);

  const filtered = cities.filter((c) => c.city.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={[dynamicStyles(isDark).container, { paddingTop: insets.top + 12 }]}>
      <View style={dynamicStyles(isDark).header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={dynamicStyles(isDark).backBtn}>
          <Text style={dynamicStyles(isDark).backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={dynamicStyles(isDark).title}>{t('explore.title')}</Text>
      </View>

      <View style={dynamicStyles(isDark).searchWrapper}>
        <TextInput
          style={dynamicStyles(isDark).searchInput}
          placeholder={t('explore.searchPlaceholder')}
          placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={dynamicStyles(isDark).center}>
          <ActivityIndicator color={tokens.colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={dynamicStyles(isDark).center}>
          <Text style={dynamicStyles(isDark).emptyText}>{t('explore.noCities')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.city_slug}
          numColumns={2}
          columnWrapperStyle={dynamicStyles(isDark).row}
          contentContainerStyle={[
            dynamicStyles(isDark).listContent,
            { paddingBottom: insets.bottom + 80 },
          ]}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={dynamicStyles(isDark).loadingMore}>
                <ActivityIndicator size="small" color={tokens.colors.primary} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <CityCollageCard
              city={item}
              locale={locale}
              onPress={() => navigation.push('ExploreCity', { citySlug: item.city_slug })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  cardInner: {
    ...StyleSheet.absoluteFillObject,
  },
  collageFullImage: {
    width: '100%',
    height: '100%',
  },
  collageFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(176,86,61,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    fontSize: 32,
  },
  collageRow: {
    flexDirection: 'row',
    flex: 1,
    height: '100%',
  },
  collageHalf: {
    flex: 1,
    height: '100%',
  },
  collageRight: {
    flex: 1,
    flexDirection: 'column',
    height: '100%',
  },
  collageQuarter: {
    flex: 1,
    width: '100%',
  },
  collageSpacer: {
    width: 2,
    height: 2,
    backgroundColor: 'transparent',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cardTextArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  cardCityName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  cardSiteCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
});

function dynamicStyles(isDark: boolean) {
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
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? '#fff' : tokens.colors.textMain,
    },
    searchWrapper: {
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    searchInput: {
      backgroundColor: isDark ? tokens.colors.darkSurface : '#fff',
      borderWidth: 1,
      borderColor: isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder,
      borderRadius: tokens.borderRadius.xl,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
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
      gap: 10,
    },
    row: {
      gap: 10,
    },
    loadingMore: {
      paddingVertical: 16,
      alignItems: 'center',
    },
  });
}
