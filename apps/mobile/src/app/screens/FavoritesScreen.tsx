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
import { useAuth, useI18n } from '@/app/providers';
import { getMyFavorites, removeFavorite } from '@/lib/api/client';
import PlaceCard from '@/components/places/PlaceCard';
import type { Place } from '@/lib/types';
import { tokens } from '@/lib/theme';

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Favorites'>>();
  const stackNav = tabNav.getParent();
  const { user } = useAuth();
  const { t } = useI18n();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingCode, setRemovingCode] = useState<string | null>(null);

  const fetchFavorites = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError('');
    getMyFavorites()
      .then(setPlaces)
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [user, t]);

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

  if (!user) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 100 }]}>
        <Text style={styles.signInTitle}>{t('auth.signInToViewFavorites')}</Text>
        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => stackNav?.navigate('Login' as never)}
          activeOpacity={0.8}
        >
          <Text style={styles.signInButtonText}>{t('auth.login')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

      {loading && <ActivityIndicator size="small" color={tokens.colors.primary} style={styles.loader} />}
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
  container: { flex: 1, backgroundColor: tokens.colors.surfaceTint },
  centered: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  signInTitle: { fontSize: 18, color: tokens.colors.textMain, textAlign: 'center', marginBottom: 24 },
  signInButton: { backgroundColor: tokens.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: tokens.borderRadius.xl },
  signInButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  content: { paddingHorizontal: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '700', color: tokens.colors.textDark, marginBottom: 20 },
  loader: { marginVertical: 24 },
  errorWrap: { marginBottom: 16 },
  errorText: { color: '#b91c1c', marginBottom: 8 },
  retryButton: { alignSelf: 'flex-start' },
  retryText: { color: tokens.colors.primary, fontWeight: '600' },
  emptyWrap: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: tokens.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    backgroundColor: tokens.colors.surface,
    ...tokens.shadow.subtle,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16, color: tokens.colors.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: tokens.colors.textMain, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: tokens.colors.textMuted, marginBottom: 20 },
  emptyCta: { backgroundColor: tokens.colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: tokens.borderRadius.xl },
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
