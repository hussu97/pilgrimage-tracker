import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation';
import type { Place } from '@/lib/types';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { formatDistance } from '@/lib/utils/place-utils';
import { useI18n, useTheme } from '@/app/providers';

interface PlaceCardProps {
  place: Place;
  compact?: boolean;
  isActive?: boolean;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function PlaceCard({ place, compact = false, isActive = false }: PlaceCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>>();
  const { t } = useI18n();
  const { isDark, units } = useTheme();

  const cardBg = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const cardBorder = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const nameColor = isDark ? '#ffffff' : tokens.colors.textMain;
  const addressColor = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const ratingBg = isDark ? 'rgba(250,204,21,0.15)' : '#fffbeb';
  const fallbackBg = isDark ? tokens.colors.darkSurface : tokens.colors.textDark;

  const images = (place.images ?? [])
    .map((img) => getFullImageUrl(img.url))
    .filter(Boolean) as string[];
  const imageUrl = images[0] ?? null;

  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;
  const openStatus =
    place.open_status ??
    (place.is_open_now === true ? 'open' : place.is_open_now === false ? 'closed' : 'unknown');
  const isOpen = openStatus === 'open';
  const isClosed = openStatus === 'closed';
  const isUnknown = openStatus === 'unknown';

  // Carousel state for regular variant
  const scrollRef = useRef<ScrollView>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (compact || images.length <= 1 || !isActive || containerWidth === 0) return;
    const id = setInterval(() => {
      setImgIdx((prev) => {
        const next = (prev + 1) % images.length;
        scrollRef.current?.scrollTo({ x: next * containerWidth, animated: true });
        return next;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [compact, images.length, isActive, containerWidth]);

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
        onPress={() => navigation.navigate('PlaceDetail', { placeCode: place.place_code })}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={place.name}
      >
        <View style={styles.compactImageWrap}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.compactImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          ) : (
            <View style={styles.compactImagePlaceholder}>
              <MaterialIcons name="location-on" size={32} color={tokens.colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.compactBody}>
          <Text style={[styles.compactName, { color: nameColor }]} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={[styles.compactAddress, { color: addressColor }]} numberOfLines={2}>
            {place.address || place.place_type || ''}
          </Text>
          <View style={styles.compactChips}>
            {isOpen && (
              <View style={styles.chipOpen}>
                <Text style={styles.chipOpenText}>{t('places.open')}</Text>
              </View>
            )}
            {isClosed && (
              <View style={styles.chipClosed}>
                <Text style={styles.chipClosedText}>{t('places.closed')}</Text>
              </View>
            )}
            {isUnknown && (
              <View style={styles.chipUnknown}>
                <Text style={styles.chipUnknownText}>{t('places.unknown')}</Text>
              </View>
            )}
            {place.distance != null && (
              <View style={styles.chipDist}>
                <Text style={styles.chipDistText}>{formatDistance(place.distance, units)}</Text>
              </View>
            )}
            {rating != null && (
              <View style={[styles.chipRating, { backgroundColor: ratingBg }]}>
                <MaterialIcons name="star" size={9} color="#92400e" />
                <Text style={styles.chipRatingText}>
                  {rating.toFixed(1)}
                  {reviewCount > 0 ? ` (${reviewCount})` : ''}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('PlaceDetail', { placeCode: place.place_code })}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={place.name}
    >
      {/* Image carousel (or single image) */}
      {images.length > 1 ? (
        <View
          style={StyleSheet.absoluteFill}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          {containerWidth > 0 ? (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              scrollEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                if (containerWidth > 0) {
                  setImgIdx(Math.round(e.nativeEvent.contentOffset.x / containerWidth));
                }
              }}
            >
              {images.map((src, i) => (
                <Image
                  key={i}
                  source={{ uri: src }}
                  style={{ width: containerWidth, height: 280 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              ))}
            </ScrollView>
          ) : (
            <Image
              source={{ uri: images[0] }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          )}
        </View>
      ) : images.length === 1 ? (
        <Image
          source={{ uri: images[0] }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      ) : (
        <View
          style={[StyleSheet.absoluteFill, styles.imageFallback, { backgroundColor: fallbackBg }]}
        >
          <MaterialIcons name="location-on" size={48} color="rgba(255,255,255,0.4)" />
        </View>
      )}

      {/* Top badges */}
      <View style={styles.topBadges}>
        <View style={styles.topBadgesLeft}>
          {isOpen && (
            <View style={styles.badgeOpen}>
              <View style={styles.openDot} />
              <Text style={styles.badgeText}>{t('places.open')}</Text>
            </View>
          )}
          {isClosed && (
            <View style={styles.badgeClosed}>
              <View style={styles.closedDot} />
              <Text style={styles.badgeText}>{t('places.closed')}</Text>
            </View>
          )}
          {isUnknown && (
            <View style={styles.badgeUnknown}>
              <Text style={styles.badgeText}>{t('places.unknown')}</Text>
            </View>
          )}
        </View>
        {place.user_has_checked_in && (
          <View style={styles.badgeVisited}>
            <MaterialIcons name="check" size={11} color="#fff" />
            <Text style={styles.badgeText}>{t('places.visited')}</Text>
          </View>
        )}
      </View>

      {/* Bottom glass info panel */}
      <View style={styles.glassPanel}>
        <Text style={styles.cardName} numberOfLines={1}>
          {place.name}
        </Text>
        <View style={styles.locationRow}>
          <MaterialIcons name="location-on" size={12} color="rgba(255,255,255,0.75)" />
          <Text style={styles.locationText} numberOfLines={1}>
            {place.address || place.place_type || ''}
          </Text>
        </View>
        <View style={styles.glassDivider} />
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            {place.distance != null && (
              <Text style={styles.distanceText}>{formatDistance(place.distance, units)}</Text>
            )}
            {rating != null && (
              <View style={styles.ratingPill}>
                <MaterialIcons name="star" size={10} color="#facc15" />
                <Text style={styles.ratingText}>
                  {rating.toFixed(1)}
                  {reviewCount > 0 ? ` (${formatCount(reviewCount)})` : ''}
                </Text>
              </View>
            )}
          </View>
          {!place.user_has_checked_in && (
            <TouchableOpacity
              style={styles.checkInBtn}
              onPress={() => navigation.navigate('PlaceDetail', { placeCode: place.place_code })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${t('places.checkIn')} ${place.name}`}
            >
              <Text style={styles.checkInText}>{t('places.checkIn')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(PlaceCard);

const styles = StyleSheet.create({
  // ── Compact (map scroller) ──────────────────────────────────────────────
  compactCard: {
    flexDirection: 'row',
    height: 128,
    borderRadius: tokens.borderRadius['2xl'], // 16px
    padding: 16,
    gap: 16,
    alignItems: 'center',
    borderWidth: 1,
    ...tokens.shadow.card,
  },
  compactImageWrap: {
    width: 96,
    height: 96,
    borderRadius: tokens.borderRadius.xl, // 12px – inner element
    overflow: 'hidden',
    backgroundColor: tokens.colors.softBlue,
    flexShrink: 0,
  },
  compactImage: { width: '100%', height: '100%' },
  compactImagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  compactBody: { flex: 1, flexDirection: 'column', justifyContent: 'center', paddingVertical: 4 },
  compactName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  compactAddress: {
    fontSize: 12,
    fontWeight: '300',
    marginBottom: 8,
  },
  compactChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // Open badge – primary blue pill
  chipOpen: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.borderRadius.full,
    backgroundColor: tokens.colors.openNow,
  },
  chipOpenText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Closed badge – red pill
  chipClosed: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.borderRadius.full,
    backgroundColor: tokens.colors.closedNow,
  },
  chipClosedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Unknown badge – grey pill
  chipUnknown: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.borderRadius.full,
    backgroundColor: tokens.colors.unknownStatus,
  },
  chipUnknownText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipDist: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: tokens.colors.softBlue,
  },
  chipDistText: { fontSize: 10, fontWeight: '500', color: tokens.colors.textSecondary },
  chipRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chipRatingText: { fontSize: 10, fontWeight: '500', color: '#92400e' },

  // ── Regular (list view) ─────────────────────────────────────────────────
  card: {
    height: 280,
    borderRadius: tokens.borderRadius['3xl'], // 24px – large card outer
    overflow: 'hidden',
    ...tokens.shadow.card,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBadges: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBadgesLeft: {
    flexDirection: 'row',
    gap: 6,
  },
  // Open badge – semi-transparent glass
  badgeOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(22, 163, 74, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.4)',
    borderRadius: tokens.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  // Closed badge – semi-transparent glass
  badgeClosed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(185, 28, 28, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
    borderRadius: tokens.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  // Unknown badge – semi-transparent glass
  badgeUnknown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)',
    borderRadius: tokens.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  // Visited badge – glass morphism
  badgeVisited: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: tokens.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ade80',
  },
  closedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f87171',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  // Glass panel – semi-transparent with subtle border
  glassPanel: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: tokens.borderRadius['2xl'], // 16px
    padding: 14,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 3,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    flex: 1,
  },
  glassDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.20)',
    marginVertical: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  distanceText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: tokens.borderRadius.full,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  checkInBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: tokens.borderRadius.full,
    marginLeft: 8,
    flexShrink: 0,
  },
  checkInText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
