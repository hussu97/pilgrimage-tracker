import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, useI18n } from '@/app/providers';
import { useLocation } from '@/app/contexts/LocationContext';
import { searchAutocomplete, getSearchPlaceDetails } from '@/lib/api/client';
import type { SearchSuggestion } from '@/lib/api/client';
import { getSearchHistory, addSearchHistory, clearSearchHistory } from '@/lib/utils/searchHistory';
import type { SearchLocation } from '@/lib/utils/searchHistory';
import { tokens } from '@/lib/theme';
import type { RootStackParamList } from '@/app/navigation';

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : '#ffffff';
  const surface = isDark ? tokens.colors.darkSurface : '#f8fafc';
  const border = isDark ? tokens.colors.darkBorder : '#e2e8f0';
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: border,
      gap: 8,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: textMain,
      padding: 0,
    },
    clearBtn: {
      padding: 2,
    },
    content: { flex: 1 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 32,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    clearHistoryBtn: {
      fontSize: 13,
      color: tokens.colors.primary,
      fontWeight: '600',
    },
    emptyText: {
      fontSize: 14,
      color: textMuted,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    errorText: {
      fontSize: 14,
      color: textMuted,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14,
    },
    rowMain: {
      fontSize: 15,
      fontWeight: '500',
      color: textMain,
      flex: 1,
    },
    rowSub: {
      fontSize: 13,
      color: textSecondary,
      flex: 1,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: border,
      marginHorizontal: 16,
    },
  });
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const { coords } = useLocation();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [history, setHistory] = useState<SearchLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  useEffect(() => {
    getSearchHistory().then(setHistory);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const data = await searchAutocomplete(q, coords.lat, coords.lng);
        setSuggestions(data.suggestions);
      } catch {
        setError(t('search.error'));
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [coords, t],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSuggestions([]);
      setError('');
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggestions]);

  const handleSelectSuggestion = async (suggestion: SearchSuggestion) => {
    setLoading(true);
    try {
      const details = await getSearchPlaceDetails(suggestion.place_id);
      const loc: SearchLocation = {
        placeId: details.place_id,
        name: suggestion.main_text,
        lat: details.lat,
        lng: details.lng,
      };
      await addSearchHistory(loc);
      (navigation as any).navigate('Main', { screen: 'Home', params: { searchLocation: loc } });
    } catch {
      setError(t('search.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHistory = async (item: SearchLocation) => {
    await addSearchHistory(item);
    (navigation as any).navigate('Main', { screen: 'Home', params: { searchLocation: item } });
  };

  const handleClearHistory = async () => {
    await clearSearchHistory();
    setHistory([]);
  };

  const showRecent = query.length < 2;
  const noResults = !loading && !error && query.length >= 2 && suggestions.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons
            name="arrow-back"
            size={22}
            color={isDark ? '#fff' : tokens.colors.textDark}
          />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color={textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.searchPlaces')}
            placeholderTextColor={textMuted}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => setQuery('')}>
              <MaterialIcons name="close" size={18} color={textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={tokens.colors.primary} />
          </View>
        )}

        {/* Error */}
        {!loading && error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* No results */}
        {!loading && noResults ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{t('search.noResults').replace('{query}', query)}</Text>
          </View>
        ) : null}

        {/* Suggestions */}
        {!loading && !error && suggestions.length > 0 && (
          <FlatList
            data={suggestions}
            keyExtractor={(s) => s.place_id}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => handleSelectSuggestion(item)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="location-on" size={20} color={textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowMain} numberOfLines={1}>
                    {item.main_text}
                  </Text>
                  {item.secondary_text ? (
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.secondary_text}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Recent searches */}
        {!loading && showRecent && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('search.recentSearches')}</Text>
              {history.length > 0 && (
                <TouchableOpacity onPress={handleClearHistory}>
                  <Text style={styles.clearHistoryBtn}>{t('search.clearHistory')}</Text>
                </TouchableOpacity>
              )}
            </View>
            {history.length === 0 ? (
              <Text style={styles.emptyText}>{t('search.recentEmpty')}</Text>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(item) => item.placeId}
                ItemSeparatorComponent={() => <View style={styles.divider} />}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => handleSelectHistory(item)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="history" size={20} color={textMuted} />
                    <Text style={styles.rowMain} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </>
        )}
      </View>
    </View>
  );
}
