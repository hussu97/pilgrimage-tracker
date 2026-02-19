import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

type MainTabParamList = {
  Home: undefined;
  Favorites: undefined;
  Groups: undefined;
  Profile: undefined;
};
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { getMyFavorites, removeFavorite } from '@/lib/api/client';
import PlaceCard from '@/components/places/PlaceCard';
import SkeletonCard from '@/components/common/SkeletonCard';
import SwipeableRow from '@/components/common/SwipeableRow';
import type { Place } from '@/lib/types';
import { tokens } from '@/lib/theme';

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.surfaceTint;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    content: { paddingHorizontal: 24 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    title: { fontSize: 24, fontWeight: '700', color: textMain, marginBottom: 20 },
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
      borderColor: border,
      backgroundColor: surface,
      ...tokens.shadow.subtle,
    },
    emptyIcon: { marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: textMain, marginBottom: 8 },
    emptyDesc: { fontSize: 14, color: textMuted, marginBottom: 20, textAlign: 'center' },
    emptyCta: {
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: tokens.borderRadius.xl,
    },
    emptyCtaText: { color: '#fff', fontWeight: '600' },
    separator: { height: 16 },
    signInTitle: { fontSize: 18, color: textMain, textAlign: 'center', marginBottom: 24 },
    signInButton: {
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: tokens.borderRadius.xl,
    },
    signInButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(0,0,0,0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Favorites'>>();
  const stackNav = tabNav.getParent();
  const { user } = useAuth();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

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

  const handleRemove = useCallback(
    async (placeCode: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setRemovingCode(placeCode);
      try {
        await removeFavorite(placeCode);
        setPlaces((prev) => prev.filter((p) => p.place_code !== placeCode));
      } catch {
        setError(t('common.error'));
      } finally {
        setRemovingCode(null);
      }
    },
    [t],
  );

  if (!user) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top + 24 }]}>
        <MaterialIcons
          name="favorite-border"
          size={56}
          color={tokens.colors.textMuted}
          style={{ marginBottom: 16 }}
        />
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

  // Skeleton data while loading
  const skeletonData =
    loading && places.length === 0
      ? (Array.from({ length: 4 }, (_, i) => ({ place_code: `skel-${i}` })) as any[])
      : null;

  const listData = skeletonData ?? places;

  return (
    <FlatList
      style={styles.container}
      data={listData}
      keyExtractor={(item) => item.place_code}
      renderItem={({ item, index }) => {
        if (String(item.place_code).startsWith('skel-')) {
          return <SkeletonCard isDark={isDark} />;
        }
        return (
          <SwipeableRow
            onDelete={() => handleRemove(item.place_code)}
            deleteLabel={t('common.remove') || 'Remove'}
            deleteColor="#EF4444"
            deleteIcon="favorite-border"
          >
            <View style={{ opacity: removingCode === item.place_code ? 0.5 : 1 }}>
              <PlaceCard place={item} isActive={index === activeIndex} />
            </View>
          </SwipeableRow>
        );
      }}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={() => (
        <View style={{ paddingHorizontal: 24 }}>
          <TouchableOpacity
            style={[styles.backBtn, { marginBottom: 16 }]}
            onPress={() => {
              if (stackNav?.canGoBack?.()) {
                stackNav.goBack();
              } else {
                tabNav.navigate('Main' as never);
              }
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="arrow-back"
              size={20}
              color={isDark ? '#fff' : tokens.colors.textDark}
            />
          </TouchableOpacity>
          <Text style={styles.title}>{t('favorites.title')}</Text>
          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchFavorites} style={styles.retryButton}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}
      ListEmptyComponent={
        !loading ? (
          <View style={[styles.emptyWrap, { marginHorizontal: 24 }]}>
            <MaterialIcons
              name="favorite-border"
              size={48}
              color={tokens.colors.textMuted}
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyTitle}>{t('favorites.empty')}</Text>
            <Text style={styles.emptyDesc}>{t('home.explorePlaces')}</Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() => tabNav.navigate('Main' as never)}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyCtaText}>{t('profile.exploreCta')}</Text>
            </TouchableOpacity>
          </View>
        ) : null
      }
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={loading && places.length > 0}
          onRefresh={fetchFavorites}
          colors={[tokens.colors.primary]}
          tintColor={tokens.colors.primary}
        />
      }
    />
  );
}
