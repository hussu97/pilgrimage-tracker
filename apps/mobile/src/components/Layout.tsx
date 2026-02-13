import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../app/screens/HomeScreen';
import MapScreen from '../app/screens/MapScreen';
import GroupsScreen from '../app/screens/GroupsScreen';
import ProfileScreen from '../app/screens/ProfileScreen';
import { useI18n } from '../app/providers';
import { tokens } from '../lib/theme';

const Tab = createBottomTabNavigator();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.tabIconText, focused && styles.tabIconTextActive]}>{name}</Text>
    </View>
  );
}

export default function Layout() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          paddingBottom: insets.bottom,
          paddingTop: 8,
          backgroundColor: tokens.colors.surface,
          borderTopColor: tokens.colors.inputBorder,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
        tabBarActiveTintColor: tokens.colors.primary,
        tabBarInactiveTintColor: tokens.colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('nav.explore'),
          tabBarIcon: ({ focused }) => <TabIcon name="⊕" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarLabel: t('nav.map'),
          tabBarIcon: ({ focused }) => <TabIcon name="◉" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          tabBarLabel: t('nav.groups'),
          tabBarIcon: ({ focused }) => <TabIcon name="◆" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('nav.profile'),
          tabBarIcon: ({ focused }) => <TabIcon name="○" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIcon: { alignItems: 'center', justifyContent: 'center' },
  tabIconText: { fontSize: 20, color: tokens.colors.textMuted },
  tabIconTextActive: { color: tokens.colors.primary },
});
