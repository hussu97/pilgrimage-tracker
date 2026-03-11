import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCities } from '@/lib/api/client';
import { useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { RootStackParamList } from '@/app/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface City {
  city: string;
  city_slug: string;
  count: number;
}

export default function ExploreCitiesScreen() {
  const navigation = useNavigation<Nav>();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const s = makeStyles(isDark);

  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getCities()
      .then((data) => {
        setCities(data.cities ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = cities.filter((c) => c.city.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={[s.container, { paddingTop: insets.top + 12 }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>Explore by City</Text>
      </View>

      <View style={s.searchWrapper}>
        <TextInput
          style={s.searchInput}
          placeholder="Search cities..."
          placeholderTextColor={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={tokens.colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyText}>No cities found.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.city_slug}
          numColumns={2}
          columnWrapperStyle={s.row}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.cityCard}
              onPress={() => navigation.push('ExploreCity', { citySlug: item.city_slug })}
              activeOpacity={0.8}
            >
              <Text style={s.cityName} numberOfLines={1}>
                {item.city}
              </Text>
              <Text style={s.siteCount}>
                {item.count} {item.count === 1 ? 'site' : 'sites'}
              </Text>
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
      paddingBottom: 24,
      gap: 10,
    },
    row: {
      gap: 10,
    },
    cityCard: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#fff',
      borderWidth: 1,
      borderColor: isDark ? tokens.colors.darkBorder : '#e5e7eb',
      borderRadius: tokens.borderRadius['2xl'],
      padding: 14,
      ...tokens.shadow.subtle,
    },
    cityName: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#fff' : tokens.colors.textMain,
      marginBottom: 4,
    },
    siteCount: {
      fontSize: 11,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
    },
  });
}
