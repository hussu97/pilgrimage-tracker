/**
 * Layout — Journey-first navigation shell.
 *
 * Replaces the 3-tab bottom navigator with:
 *   • Minimal 2-item bottom bar (Dashboard | Map) — icons only, no labels
 *   • Center elevated FAB for "New Journey"
 *
 * Screens are managed by the root stack navigator in navigation.tsx.
 * This Layout renders as the "Main" screen and hosts the tab-like routing
 * by rendering the correct child based on the active tab state.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
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
      paddingTop: 10,
    },
    tabCol: {
      flex: 1,
      alignItems: 'center',
    },
    tabItem: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 16,
    },
    fabCol: {
      flex: 1,
      alignItems: 'center',
    },
    fabWrapper: {
      alignItems: 'center',
      marginBottom: 10,
    },
    fab: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: tokens.colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 10,
    },
    activePill: {
      position: 'absolute',
      top: -2,
      width: 20,
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

  // Press-scale animations for each nav item
  const dashAnim = useRef(new Animated.Value(1)).current;
  const mapAnim = useRef(new Animated.Value(1)).current;
  const fabAnim = useRef(new Animated.Value(1)).current;

  const pressIn = (anim: Animated.Value) => {
    Animated.spring(anim, {
      toValue: 0.8,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  const pressOut = (anim: Animated.Value) => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 12,
    }).start();
  };

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

  return (
    <View style={styles.container}>
      {/* Screen content — fills full height; each screen's ScrollView adds its own bottom padding */}
      <View style={{ flex: 1 }}>
        <HomeScreen />
      </View>

      {/* Minimal bottom bar — absolutely positioned so content scrolls behind it */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 100}
        tint={isDark ? 'dark' : 'light'}
        style={[styles.bottomBar]}
      >
        <View style={[styles.barContent, { paddingBottom: insets.bottom || 20 }]}>
          {/* Column 1: Dashboard — flex:1 ensures it takes exactly 1/3 of the bar width */}
          <View style={styles.tabCol}>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('Dashboard')}
              onPressIn={() => pressIn(dashAnim)}
              onPressOut={() => pressOut(dashAnim)}
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel={t('nav.dashboard') || 'Dashboard'}
              accessibilityState={{ selected: activeTab === 'Dashboard' }}
            >
              {activeTab === 'Dashboard' && <View style={styles.activePill} />}
              <Animated.View style={{ transform: [{ scale: dashAnim }] }}>
                <MaterialIcons name="home" size={30} color={textColor(activeTab === 'Dashboard')} />
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* Column 2: FAB — flex:1 guarantees the FAB is at the exact horizontal center */}
          <View style={styles.fabCol}>
            <View style={styles.fabWrapper}>
              <TouchableOpacity
                style={styles.fab}
                onPress={handleNewJourney}
                onPressIn={() => pressIn(fabAnim)}
                onPressOut={() => pressOut(fabAnim)}
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={t('journey.newJourney') || 'New Journey'}
              >
                <Animated.View
                  style={{
                    transform: [{ scale: fabAnim }],
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MaterialIcons name="add" size={32} color="white" />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Column 3: Map — flex:1 mirrors Column 1 width */}
          <View style={styles.tabCol}>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={handleMapTab}
              onPressIn={() => pressIn(mapAnim)}
              onPressOut={() => pressOut(mapAnim)}
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel={t('nav.map') || 'Map'}
              accessibilityState={{ selected: activeTab === 'Map' }}
            >
              {activeTab === 'Map' && <View style={styles.activePill} />}
              <Animated.View style={{ transform: [{ scale: mapAnim }] }}>
                <MaterialIcons name="explore" size={30} color={textColor(activeTab === 'Map')} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </View>
  );
}
