/**
 * UpdateBanner — persistent soft-update banner shown at the top of HomeScreen.
 *
 * Shown when the app version is below min_version_soft but above min_version_hard.
 * Dismissable within the current session (not persisted to storage).
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/lib/theme';
import { useI18n, useTheme } from '@/app/providers';
import { useUpdate } from '@/lib/updateContext';

export default function UpdateBanner() {
  const { softUpdate, storeUrl, dismissSoftUpdate } = useUpdate();
  const { t } = useI18n();
  const { isDark } = useTheme();

  if (!softUpdate) return null;

  const styles = makeStyles(isDark);

  function handleUpdate() {
    if (storeUrl) {
      Linking.openURL(storeUrl).catch(() => {});
    }
  }

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <MaterialIcons name="system-update" size={18} color="#ffffff" style={styles.icon} />
      <Text style={styles.message} numberOfLines={2}>
        {t('update.softBannerMessage')}
      </Text>

      <TouchableOpacity
        style={styles.updateButton}
        onPress={handleUpdate}
        accessibilityRole="button"
        accessibilityLabel={t('update.softBannerButton')}
      >
        <Text style={styles.updateButtonText}>{t('update.softBannerButton')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.dismissButton}
        onPress={dismissSoftUpdate}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name="close" size={16} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: tokens.colors.primary,
      paddingVertical: 10,
      paddingLeft: 12,
      paddingRight: 8,
      gap: 8,
    },
    icon: {
      flexShrink: 0,
    },
    message: {
      flex: 1,
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    updateButton: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: tokens.borderRadius.xl,
      paddingVertical: 4,
      paddingHorizontal: 10,
      flexShrink: 0,
    },
    updateButtonText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '700',
    },
    dismissButton: {
      padding: 4,
      flexShrink: 0,
    },
  });
}
