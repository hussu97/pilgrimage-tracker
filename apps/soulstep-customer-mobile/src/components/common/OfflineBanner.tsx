import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { tokens } from '@/lib/theme';
import { useI18n, useTheme } from '@/app/providers';

export default function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const { t } = useI18n();
  const { isDark } = useTheme();

  if (isConnected !== false) return null;

  const styles = makeStyles(isDark);

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text}>{t('common.noInternet')}</Text>
    </View>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    banner: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      backgroundColor: isDark ? '#7f1d1d' : '#ef4444',
      paddingVertical: 8,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
}
