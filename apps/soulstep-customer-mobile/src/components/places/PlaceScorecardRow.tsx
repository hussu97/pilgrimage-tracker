import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { openDirections } from '@/lib/share';
import { crowdColor } from '@/lib/utils/crowdColor';
import { tokens } from '@/lib/theme';
import type { PlaceDetail } from '@/lib/types';

interface Props {
  place: PlaceDetail;
  crowdLevel: string | undefined;
  totalCheckins: number | undefined;
  t: (key: string) => string;
  isDark: boolean;
}

function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function PlaceScorecardRow({ place, crowdLevel, totalCheckins, t, isDark }: Props) {
  const bg = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const textMain = isDark ? '#ffffff' : tokens.colors.textMain;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 20,
        marginTop: 20,
        marginBottom: 4,
        backgroundColor: bg,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: border,
        paddingVertical: 16,
        ...tokens.shadow.subtle,
      }}
    >
      <TouchableOpacity
        style={{ flex: 1, alignItems: 'center', gap: 4 }}
        onPress={() => openDirections(place.lat, place.lng, place.name)}
        activeOpacity={0.7}
      >
        <MaterialIcons name="directions" size={20} color={tokens.colors.primary} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: textMain, textAlign: 'center' }}>
          {place.distance != null ? formatDist(place.distance) : '—'}
        </Text>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '600',
            color: textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            textAlign: 'center',
          }}
        >
          {t('placeDetail.distance')}
        </Text>
      </TouchableOpacity>

      <View style={{ width: 1, height: 40, backgroundColor: border }} />

      <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
        <MaterialIcons name="people" size={20} color={crowdColor(crowdLevel)} />
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: crowdColor(crowdLevel),
            textAlign: 'center',
          }}
        >
          {crowdLevel ?? '—'}
        </Text>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '600',
            color: textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            textAlign: 'center',
          }}
        >
          {t('placeDetail.crowd')}
        </Text>
      </View>

      <View style={{ width: 1, height: 40, backgroundColor: border }} />

      <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
        <MaterialIcons name="check-circle-outline" size={20} color={tokens.colors.primary} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: textMain, textAlign: 'center' }}>
          {totalCheckins != null ? totalCheckins.toString() : '—'}
        </Text>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '600',
            color: textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            textAlign: 'center',
          }}
        >
          {t('placeDetail.visits')}
        </Text>
      </View>
    </View>
  );
}

export default React.memo(PlaceScorecardRow);
