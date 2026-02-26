/**
 * AdBannerNative — renders a placeholder ad banner on mobile.
 *
 * Self-gating: renders nothing when ads are disabled, consent not given,
 * or user is premium. Dark-mode aware using makeStyles pattern.
 *
 * Once react-native-google-mobile-ads is installed and configured, the
 * placeholder will be replaced with a real BannerAd component.
 *
 * Usage: <AdBannerNative slot="place-detail-mid" format="banner" />
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAds } from './AdProvider';
import { useI18n } from '@/app/providers';
import { useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import type { AdSlotName, AdFormat } from './ad-constants';

interface AdBannerNativeProps {
  /** Slot name — maps to an ad unit ID via backend config. */
  slot: AdSlotName;
  /** Ad format hint. */
  format?: AdFormat;
}

function makeStyles(isDark: boolean) {
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return StyleSheet.create({
    container: {
      width: '100%',
      backgroundColor: surface,
      borderRadius: tokens.borderRadius['2xl'],
      borderWidth: 1,
      borderColor: border,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    banner: {
      minHeight: 60,
    },
    mediumRectangle: {
      minHeight: 250,
    },
    adaptive: {
      minHeight: 60,
    },
    label: {
      position: 'absolute',
      top: 4,
      left: 8,
      fontSize: 10,
      color: textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    placeholder: {
      fontSize: 12,
      color: textMuted,
    },
  });
}

export default function AdBannerNative({ slot, format = 'banner' }: AdBannerNativeProps) {
  const { canShowAds, getSlotId } = useAds();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const slotId = getSlotId(slot);

  if (!canShowAds || !slotId) return null;

  const formatStyle =
    format === 'medium-rectangle'
      ? styles.mediumRectangle
      : format === 'adaptive'
        ? styles.adaptive
        : styles.banner;

  return (
    <View style={[styles.container, formatStyle]}>
      <Text style={styles.label}>{t('ads.label')}</Text>
      {/* Placeholder — replace with BannerAd from react-native-google-mobile-ads */}
      <Text style={styles.placeholder}>Ad</Text>
    </View>
  );
}
