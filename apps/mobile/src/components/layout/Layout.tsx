import React, { useState, useEffect } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import HomeScreen from '@/app/screens/HomeScreen';
import GroupsScreen from '@/app/screens/GroupsScreen';
import ProfileScreen from '@/app/screens/ProfileScreen';
import { useI18n, useAuth, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import { getNotifications } from '@/lib/api/client';

const Tab = createBottomTabNavigator();

type TabIconName = 'explore' | 'group' | 'person';

const TAB_ICONS: Record<string, TabIconName> = {
  explore: 'explore',
  groups: 'group',
  person: 'person',
};

function TabIcon({
  iconKey,
  focused,
  showDot,
}: {
  iconKey: string;
  focused: boolean;
  showDot?: boolean;
}) {
  const iconName = TAB_ICONS[iconKey] ?? 'circle';
  const color = focused ? tokens.colors.primary : tokens.colors.textMuted;
  return (
    <View style={styles.tabIconWrapper}>
      {focused && <View style={styles.activeBar} />}
      <View>
        <MaterialIcons name={iconName} size={24} color={color} />
        {showDot && <View style={styles.notificationDot} />}
      </View>
    </View>
  );
}

function GlassTabBar({
  state,
  descriptors,
  navigation,
  insets,
  isDark,
  unreadCount,
}: BottomTabBarProps & { insets: { bottom: number }; isDark: boolean; unreadCount: number }) {
  return (
    <BlurView
      intensity={Platform.OS === 'ios' ? 80 : 100}
      tint={isDark ? 'dark' : 'light'}
      style={[
        styles.glassTabBar,
        {
          paddingBottom: insets.bottom || 20,
          borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
        },
      ]}
    >
      <View style={styles.glassTabBarShadow} />
      <View style={styles.tabBarContent}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
          const isFocused = state.index === index;

          const iconKey =
            route.name === 'Home' ? 'explore' : route.name === 'Groups' ? 'groups' : 'person';
          const showDot = route.name === 'Profile' && unreadCount > 0;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              {isFocused && <View style={styles.activePill} />}
              <View style={styles.iconContainer}>
                <MaterialIcons
                  name={TAB_ICONS[iconKey] ?? 'circle'}
                  size={24}
                  color={
                    isFocused
                      ? tokens.colors.primary
                      : isDark
                        ? tokens.colors.darkTextSecondary
                        : tokens.colors.textMuted
                  }
                />
                {showDot && <View style={styles.notificationDot} />}
              </View>
              {/* Label: visible when active, hidden when inactive (per design spec) */}
              {isFocused && (
                <Text style={[styles.tabLabel, { color: tokens.colors.primary }]}>{label}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </BlurView>
  );
}

export default function Layout() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getNotifications(1, 0)
      .then((res) => setUnreadCount(res.unread_count ?? 0))
      .catch(() => {});
  }, [user]);

  return (
    <Tab.Navigator
      tabBar={(props) => (
        <GlassTabBar {...props} insets={insets} isDark={isDark} unreadCount={unreadCount} />
      )}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('nav.explore'),
        }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          tabBarLabel: t('nav.groups'),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('nav.profile'),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  glassTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 0.5,
    overflow: 'hidden',
  },
  glassTabBarShadow: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  iconContainer: {
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    top: -6,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: tokens.colors.primary,
    shadowColor: tokens.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  tabIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  activeBar: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: tokens.colors.primary,
    marginBottom: 2,
  },
  notificationDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
