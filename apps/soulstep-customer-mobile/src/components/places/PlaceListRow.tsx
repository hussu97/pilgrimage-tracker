import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import type { Place } from '@/lib/types';

interface PlaceListRowProps {
  place: Place;
  t: (key: string) => string;
  leftBadge?: React.ReactNode;
  rightSlot?: React.ReactNode;
  isHighlighted?: boolean;
  onPress?: () => void;
}

function PlaceListRow({
  place,
  t,
  leftBadge,
  rightSlot,
  isHighlighted = false,
  onPress,
}: PlaceListRowProps) {
  const { isDark } = useTheme();
  const s = makeStyles(isDark);

  const imageUrl = place.images?.[0]?.url ? getFullImageUrl(place.images[0].url) : null;
  const openStatus =
    place.open_status ??
    (place.is_open_now === true ? 'open' : place.is_open_now === false ? 'closed' : 'unknown');
  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;

  const rowStyle = [s.row, isHighlighted && s.rowHighlighted];

  const content = (
    <View style={rowStyle}>
      {/* Left badge slot */}
      {leftBadge != null && <View style={s.leftBadge}>{leftBadge}</View>}

      {/* Thumbnail */}
      <View style={s.thumb}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={s.thumbImg} resizeMode="cover" />
        ) : (
          <View style={s.thumbFallback}>
            <MaterialIcons
              name="place"
              size={20}
              color={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
            />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={s.info}>
        <Text style={s.name} numberOfLines={1}>
          {place.name}
        </Text>
        {place.address ? (
          <Text style={s.address} numberOfLines={1}>
            {place.address}
          </Text>
        ) : null}

        {/* Pill row */}
        <View style={s.pillRow}>
          {openStatus === 'open' && (
            <View style={s.pillOpen}>
              <View style={s.openDot} />
              <Text style={s.pillText}>{t('places.open')}</Text>
            </View>
          )}
          {openStatus === 'closed' && (
            <View style={s.pillClosed}>
              <View style={s.closedDot} />
              <Text style={s.pillText}>{t('places.closed')}</Text>
            </View>
          )}
          {rating != null && (
            <View style={s.pillRating}>
              <MaterialIcons name="star" size={9} color="#F59E0B" />
              <Text style={s.pillRatingText}>
                {rating.toFixed(1)}
                {reviewCount > 0 ? ` (${reviewCount})` : ''}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Right slot */}
      {rightSlot != null && <View style={s.rightSlot}>{rightSlot}</View>}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

export default React.memo(PlaceListRow);

function makeStyles(isDark: boolean) {
  const surface = isDark ? tokens.colors.darkSurface : '#ffffff';
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: tokens.borderRadius['2xl'],
      backgroundColor: isDark ? 'rgba(30,30,30,0.85)' : 'rgba(255,255,255,0.85)',
      borderWidth: 1,
      borderColor: border,
      ...tokens.shadow.card,
    },
    rowHighlighted: {
      borderColor: tokens.colors.primary,
      borderWidth: 2,
    },
    leftBadge: {
      flexShrink: 0,
    },
    thumb: {
      width: 60,
      height: 60,
      borderRadius: tokens.borderRadius.xl,
      overflow: 'hidden',
      flexShrink: 0,
    },
    thumbImg: {
      width: 60,
      height: 60,
    },
    thumbFallback: {
      width: 60,
      height: 60,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#f1f5f9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 13,
      fontWeight: '600',
      color: textMain,
      marginBottom: 2,
    },
    address: {
      fontSize: 11,
      color: textMuted,
      marginBottom: 4,
    },
    pillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    pillOpen: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: tokens.borderRadius.full,
      backgroundColor: 'rgba(22,163,74,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(74,222,128,0.3)',
    },
    pillClosed: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: tokens.borderRadius.full,
      backgroundColor: 'rgba(185,28,28,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(248,113,113,0.3)',
    },
    openDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: '#4ade80',
    },
    closedDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: '#f87171',
    },
    pillText: {
      fontSize: 9,
      fontWeight: '700',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    pillRating: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: tokens.borderRadius.full,
      backgroundColor: isDark ? 'rgba(250,204,21,0.12)' : '#fffbeb',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(250,204,21,0.2)' : '#fef3c7',
    },
    pillRatingText: {
      fontSize: 9,
      fontWeight: '700',
      color: '#92400e',
    },
    rightSlot: {
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
  });
}
