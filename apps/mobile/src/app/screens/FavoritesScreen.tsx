import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type MainTabParamList = { Home: undefined; Favorites: undefined; Groups: undefined; Profile: undefined };
import { useI18n } from '../providers';
import { getMyFavorites, removeFavorite } from '../../lib/api/client';
import PlaceCard from '../../components/PlaceCard';
import type { Place } from '../../lib/types';

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Favorites'>>();
  const { t } = useI18n();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingCode, setRemovingCode] = useState<string | null>(null);

  const fetchFavorites = useCallback(() => {
    setLoading(true);
    setError('');
    getMyFavorites()
      .then(setPlaces)
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const handleRemove = async (placeCode: string) => {
    setRemovingCode(placeCode);
    try {
      await removeFavorite(placeCode);
      setPlaces((prev) => prev.filter((p) => p.place_code !== placeCode));
    } catch {
      setError(t('common.error'));
    } finally {
      setRemovingCode(null);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
      ]}
    >
      <Text style={styles.sectionLabel}>{t('nav.saved')}</Text>
      <Text style={styles.title}>{t('favorites.title')}</Text>

      {loading && <ActivityIndicator size="small" color="#0d9488" style={styles.loader} />}
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchFavorites} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && places.length === 0 && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>♥</Text>
          <Text style={styles.emptyTitle}>{t('favorites.empty')}</Text>
          <Text style={styles.emptyDesc}>{t('home.explorePlaces')}</Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => tabNav.navigate('Home')}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyCtaText}>{t('profile.exploreCta')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {!loading && !error && places.length > 0 && (
        <View style={styles.list}>
          {places.map((place) => (
            <View key={place.place_code} style={styles.cardWrap}>
              <PlaceCard place={place} />
              <TouchableOpacity
                style={[styles.removeButton, removingCode === place.place_code && styles.removeButtonDisabled]}
                onPress={() => handleRemove(place.place_code)}
                disabled={removingCode === place.place_code}
              >
                <Text style={styles.removeIcon}>♥</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  content: { paddingHorizontal: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0d9488',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 20 },
  loader: { marginVertical: 24 },
  errorWrap: { marginBottom: 16 },
  errorText: { color: '#c00', marginBottom: 8 },
  retryButton: { alignSelf: 'flex-start' },
  retryText: { color: '#0d9488', fontWeight: '600' },
  emptyWrap: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  emptyIcon: { fontSize: 48, marginBottom: 16, color: '#9ca3af' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  emptyCta: { backgroundColor: '#0d9488', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyCtaText: { color: '#fff', fontWeight: '600' },
  list: { gap: 16 },
  cardWrap: { position: 'relative' },
  removeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonDisabled: { opacity: 0.5 },
  removeIcon: { color: '#fff', fontSize: 18 },
});
