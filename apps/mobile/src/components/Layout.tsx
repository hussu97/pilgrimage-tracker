import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../app/screens/HomeScreen';
import MapScreen from '../app/screens/MapScreen';
import GroupsScreen from '../app/screens/GroupsScreen';
import ProfileScreen from '../app/screens/ProfileScreen';
import { useI18n, useAuth } from '../app/providers';
import { tokens } from '../lib/theme';
import { getNotifications } from '../lib/api/client';

const Tab = createBottomTabNavigator();

// Icon glyphs — unicode approximations until vector icons are wired up
const TAB_ICONS: Record<string, { default: string; active: string }> = {
  explore: { default: '⊙', active: '⊕' },
  map:     { default: '◻', active: '◼' },
  groups:  { default: '◇', active: '◆' },
  person:  { default: '○', active: '●' },
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
  const icons = TAB_ICONS[iconKey] ?? { default: '●', active: '●' };
  return (
    <View style={styles.tabIconWrapper}>
      {focused && <View style={styles.activeBar} />}
      <View>
        <Text style={[styles.tabIconText, focused && styles.tabIconTextActive]}>
          {focused ? icons.active : icons.default}
        </Text>
        {showDot && <View style={styles.notificationDot} />}
      </View>
    </View>
  );
}

export default function Layout() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getNotifications(1, 0)
      .then((res) => setUnreadCount(res.unread_count ?? 0))
      .catch(() => {});
  }, [user]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          paddingBottom: insets.bottom,
          paddingTop: 4,
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderTopColor: '#F1F5F9',
          borderTopWidth: 1,
          height: 56 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 2 },
        tabBarActiveTintColor: tokens.colors.primary,
        tabBarInactiveTintColor: tokens.colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('nav.explore'),
          tabBarIcon: ({ focused }) => <TabIcon iconKey="explore" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarLabel: t('nav.map'),
          tabBarIcon: ({ focused }) => <TabIcon iconKey="map" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          tabBarLabel: t('nav.groups'),
          tabBarIcon: ({ focused }) => <TabIcon iconKey="groups" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('nav.profile'),
          tabBarIcon: ({ focused }) => (
            <TabIcon iconKey="person" focused={focused} showDot={unreadCount > 0} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
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
  tabIconText: {
    fontSize: 20,
    color: tokens.colors.textMuted,
  },
  tabIconTextActive: {
    color: tokens.colors.primary,
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
