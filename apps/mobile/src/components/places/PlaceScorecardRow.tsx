import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
}

function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function PlaceScorecardRow({ place, crowdLevel, totalCheckins, t }: Props) {
  return (
    <View style={styles.scorecardRow}>
      <TouchableOpacity
        style={styles.scorecard}
        onPress={() => openDirections(place.lat, place.lng, place.name)}
        activeOpacity={0.7}
      >
        <MaterialIcons name="directions" size={20} color={tokens.colors.primary} />
        <Text style={styles.scorecardValue}>
          {place.distance != null ? formatDist(place.distance) : '—'}
        </Text>
        <Text style={styles.scorecardLabel}>{t('placeDetail.distance')}</Text>
      </TouchableOpacity>

      <View style={styles.scorecardDivider} />

      <View style={styles.scorecard}>
        <MaterialIcons name="people" size={20} color={crowdColor(crowdLevel)} />
        <Text style={[styles.scorecardValue, { color: crowdColor(crowdLevel) }]}>
          {crowdLevel ?? '—'}
        </Text>
        <Text style={styles.scorecardLabel}>{t('placeDetail.crowd')}</Text>
      </View>

      <View style={styles.scorecardDivider} />

      <View style={styles.scorecard}>
        <MaterialIcons name="check-circle-outline" size={20} color={tokens.colors.primary} />
        <Text style={styles.scorecardValue}>
          {totalCheckins != null ? totalCheckins.toString() : '—'}
        </Text>
        <Text style={styles.scorecardLabel}>{t('placeDetail.visits')}</Text>
      </View>
    </View>
  );
}

export default React.memo(PlaceScorecardRow);

const styles = StyleSheet.create({
  scorecardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 4,
    backgroundColor: tokens.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    paddingVertical: 16,
    ...tokens.shadow.subtle,
  },
  scorecard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  scorecardDivider: {
    width: 1,
    height: 40,
    backgroundColor: tokens.colors.inputBorder,
  },
  scorecardValue: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.colors.textMain,
    textAlign: 'center',
  },
  scorecardLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
