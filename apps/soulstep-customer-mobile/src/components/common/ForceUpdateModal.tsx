/**
 * ForceUpdateModal — full-screen blocking modal shown when the server returns
 * HTTP 426 (hard update required).
 *
 * Renders above the navigation container so it covers every screen. There is
 * no dismiss option; the user must open the store to continue.
 */
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Linking, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/lib/theme';
import { useI18n, useTheme } from '@/app/providers';
import { useUpdate } from '@/lib/updateContext';

export default function ForceUpdateModal() {
  const { forceUpdate, storeUrl } = useUpdate();
  const { t } = useI18n();
  const { isDark } = useTheme();

  if (!forceUpdate) return null;

  const styles = makeStyles(isDark);

  function handleUpdate() {
    if (storeUrl) {
      Linking.openURL(storeUrl).catch(() => {});
    }
  }

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      // No onRequestClose — intentionally blocks back button on Android
    >
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="system-update" size={80} color={tokens.colors.primary} />
        </View>

        <Text style={styles.title}>{t('update.hardTitle')}</Text>
        <Text style={styles.message}>{t('update.hardMessage')}</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={handleUpdate}
          accessibilityRole="button"
          accessibilityLabel={t('update.hardButton')}
        >
          <Text style={styles.buttonText}>{t('update.hardButton')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkBg : '#F0F7FF',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    iconWrap: {
      marginBottom: 32,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: isDark ? `${tokens.colors.primary}22` : `${tokens.colors.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: isDark ? '#ffffff' : tokens.colors.textDark,
      textAlign: 'center',
      marginBottom: 16,
      letterSpacing: -0.5,
    },
    message: {
      fontSize: 15,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 40,
    },
    button: {
      backgroundColor: tokens.colors.primary,
      borderRadius: tokens.borderRadius['2xl'],
      paddingVertical: 16,
      paddingHorizontal: 48,
      alignItems: 'center',
    },
    buttonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
