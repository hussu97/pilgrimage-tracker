/**
 * ConsentBanner — GDPR/CCPA consent bottom sheet for mobile.
 *
 * Shown on first launch when ads are enabled and consent hasn't been given.
 * "Accept All" grants both ads + analytics consent. "Manage Preferences"
 * reveals individual toggles.
 *
 * Mirrors web ConsentBanner.tsx using React Native primitives.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, Switch, StyleSheet } from 'react-native';
import { useAds } from '@/components/ads/AdProvider';
import { useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';

function makeStyles(isDark: boolean) {
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textPrimary = isDark ? tokens.colors.textLight : tokens.colors.textDark;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;

  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: surface,
      borderTopLeftRadius: tokens.borderRadius['3xl'],
      borderTopRightRadius: tokens.borderRadius['3xl'],
      borderWidth: 1,
      borderColor: border,
      borderBottomWidth: 0,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 36,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: textPrimary,
      marginBottom: 8,
    },
    body: {
      fontSize: 14,
      color: textSecondary,
      lineHeight: 20,
      marginBottom: 20,
    },
    prefRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    prefLabel: {
      fontSize: 14,
      color: textPrimary,
    },
    prefsContainer: {
      marginBottom: 16,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    primaryBtn: {
      flex: 1,
      backgroundColor: tokens.colors.primary,
      borderRadius: tokens.borderRadius.xl,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryBtnText: {
      color: tokens.colors.textLight,
      fontSize: 14,
      fontWeight: '600',
    },
    secondaryBtn: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkBorder : tokens.colors.silverLight,
      borderRadius: tokens.borderRadius.xl,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
  });
}

export default function ConsentBanner() {
  const { showConsentBanner, acceptAll, dismissConsentBanner, consent, setConsent } = useAds();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const [showPreferences, setShowPreferences] = useState(false);
  const [adsChecked, setAdsChecked] = useState(consent.ads ?? true);
  const [analyticsChecked, setAnalyticsChecked] = useState(consent.analytics ?? true);

  if (!showConsentBanner) return null;

  const handleAcceptAll = () => {
    acceptAll();
    dismissConsentBanner();
  };

  const handleSave = () => {
    setConsent('ads', adsChecked);
    setConsent('analytics', analyticsChecked);
    dismissConsentBanner();
  };

  return (
    <Modal visible transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={handleAcceptAll}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t('consent.title')}</Text>
          <Text style={styles.body}>{t('consent.body')}</Text>

          {showPreferences && (
            <View style={styles.prefsContainer}>
              <View style={styles.prefRow}>
                <Text style={styles.prefLabel}>{t('consent.personalizedAds')}</Text>
                <Switch
                  value={adsChecked}
                  onValueChange={setAdsChecked}
                  trackColor={{ false: tokens.colors.switchTrackOff, true: tokens.colors.accent }}
                  thumbColor={adsChecked ? tokens.colors.primary : tokens.colors.switchThumbOff}
                />
              </View>
              <View style={styles.prefRow}>
                <Text style={styles.prefLabel}>{t('consent.analytics')}</Text>
                <Switch
                  value={analyticsChecked}
                  onValueChange={setAnalyticsChecked}
                  trackColor={{ false: tokens.colors.switchTrackOff, true: tokens.colors.accent }}
                  thumbColor={
                    analyticsChecked ? tokens.colors.primary : tokens.colors.switchThumbOff
                  }
                />
              </View>
            </View>
          )}

          <View style={styles.buttonRow}>
            {showPreferences ? (
              <Pressable style={styles.primaryBtn} onPress={handleSave}>
                <Text style={styles.primaryBtnText}>{t('consent.save')}</Text>
              </Pressable>
            ) : (
              <>
                <Pressable style={styles.primaryBtn} onPress={handleAcceptAll}>
                  <Text style={styles.primaryBtnText}>{t('consent.acceptAll')}</Text>
                </Pressable>
                <Pressable style={styles.secondaryBtn} onPress={() => setShowPreferences(true)}>
                  <Text style={styles.secondaryBtnText}>{t('consent.managePreferences')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
