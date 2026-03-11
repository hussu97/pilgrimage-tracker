/**
 * Layout — Journey-first navigation shell.
 *
 * Replaces the 3-tab bottom navigator with:
 *   • Minimal 2-item bottom bar (Dashboard | Map)
 *   • Center elevated FAB for "New Journey"
 *
 * Screens are managed by the root stack navigator in navigation.tsx.
 * This Layout renders as the "Main" screen and hosts the tab-like routing
 * by rendering the correct child based on the active tab state.
 */
import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useI18n, useAuth, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import { getNotifications } from '@/lib/api/client';
import HomeScreen from '@/app/screens/HomeScreen';
import type { RootStackParamList } from '@/app/navigation';

type TabName = 'Dashboard' | 'Map';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight,
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopWidth: 0.5,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      overflow: 'hidden',
    },
    barContent: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 32,
      paddingTop: 8,
    },
    tabItem: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      paddingHorizontal: 16,
      gap: 2,
    },
    tabLabel: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    fabWrapper: {
      alignItems: 'center',
      marginBottom: 12,
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: tokens.colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 8,
    },
    fabLabel: {
      fontSize: 8,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: tokens.colors.primary,
      marginTop: 3,
      opacity: 0.8,
    },
    activePill: {
      position: 'absolute',
      top: -2,
      width: 24,
      height: 3,
      borderRadius: 2,
      backgroundColor: tokens.colors.primary,
    },
  });
}

export default function Layout() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigation = useNavigation<Nav>();
  const styles = makeStyles(isDark);

  const [activeTab, setActiveTab] = useState<TabName>('Dashboard');
  const [_unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getNotifications(1, 0)
      .then((res) => setUnreadCount(res.unread_count ?? 0))
      .catch(() => {});
  }, [user]);

  const handleNewJourney = () => {
    if (user) {
      navigation.navigate('CreateGroup');
    } else {
      navigation.navigate('Login');
    }
  };

  const handleMapTab = () => {
    setActiveTab('Map');
    navigation.navigate('MapDiscovery');
  };

  const textColor = (active: boolean) =>
    active
      ? tokens.colors.primary
      : isDark
        ? tokens.colors.darkTextSecondary
        : tokens.colors.textMuted;

  const BAR_HEIGHT = 64 + (insets.bottom || 20);

  return (
    <View style={styles.container}>
      {/* Screen content */}
      <View style={{ flex: 1, paddingBottom: BAR_HEIGHT }}>
        <HomeScreen />
      </View>

      {/* Minimal bottom bar */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 100}
        tint={isDark ? 'dark' : 'light'}
        style={[styles.bottomBar]}
      >
        <View style={[styles.barContent, { paddingBottom: insets.bottom || 20 }]}>
          {/* Dashboard tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('Dashboard')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('nav.dashboard') || 'Dashboard'}
            accessibilityState={{ selected: activeTab === 'Dashboard' }}
          >
            {activeTab === 'Dashboard' && <View style={styles.activePill} />}
            <MaterialIcons name="home" size={26} color={textColor(activeTab === 'Dashboard')} />
            <Text
              style={[
                styles.tabLabel,
                {
                  color: textColor(activeTab === 'Dashboard'),
                  opacity: activeTab === 'Dashboard' ? 1 : 0.5,
                },
              ]}
            >
              {t('nav.dashboard') || 'Dashboard'}
            </Text>
          </TouchableOpacity>

          {/* Center FAB — New Journey */}
          <View style={styles.fabWrapper}>
            <TouchableOpacity
              style={styles.fab}
              onPress={handleNewJourney}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('journey.newJourney') || 'New Journey'}
            >
              <MaterialIcons name="add" size={30} color="white" />
            </TouchableOpacity>
            <Text style={styles.fabLabel}>{t('journey.newJourney') || 'Journey'}</Text>
          </View>

          {/* Map tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={handleMapTab}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('nav.map') || 'Map'}
            accessibilityState={{ selected: activeTab === 'Map' }}
          >
            {activeTab === 'Map' && <View style={styles.activePill} />}
            <MaterialIcons name="map" size={26} color={textColor(activeTab === 'Map')} />
            <Text
              style={[
                styles.tabLabel,
                { color: textColor(activeTab === 'Map'), opacity: activeTab === 'Map' ? 1 : 0.5 },
              ]}
            >
              {t('nav.map') || 'Map'}
            </Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </View>
  );
}
