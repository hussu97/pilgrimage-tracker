import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../app/screens/HomeScreen';
import GroupsScreen from '../app/screens/GroupsScreen';
import ProfileScreen from '../app/screens/ProfileScreen';
import { useI18n, useAuth, useTheme } from '../app/providers';
import { tokens } from '../lib/theme';
import { getNotifications } from '../lib/api/client';

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
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          paddingBottom: insets.bottom,
          paddingTop: 4,
          backgroundColor: isDark ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.92)',
          borderTopColor: isDark ? tokens.colors.darkBorder : '#F1F5F9',
          borderTopWidth: 1,
          height: 56 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 2 },
        tabBarActiveTintColor: tokens.colors.primary,
        tabBarInactiveTintColor: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
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
