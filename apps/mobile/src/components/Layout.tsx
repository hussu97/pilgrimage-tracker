import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../app/screens/HomeScreen';
import FavoritesScreen from '../app/screens/FavoritesScreen';
import GroupsScreen from '../app/screens/GroupsScreen';
import ProfileScreen from '../app/screens/ProfileScreen';
import { useI18n } from '../app/providers';
import { SHOW_SELECT_PATH_KEY } from '../lib/constants';

const Tab = createBottomTabNavigator();

function TabIcon({ name }: { name: string }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={styles.tabIconText}>{name}</Text>
    </View>
  );
}

export default function Layout() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const navigation = useNavigation();

  useEffect(() => {
    AsyncStorage.getItem(SHOW_SELECT_PATH_KEY).then((v) => {
      if (v === 'true') {
        AsyncStorage.removeItem(SHOW_SELECT_PATH_KEY);
        navigation.navigate('SelectPath' as never);
      }
    });
  }, [navigation]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { paddingBottom: insets.bottom, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('nav.explore'),
          tabBarIcon: () => <TabIcon name="⊕" />,
        }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{
          tabBarLabel: t('nav.saved'),
          tabBarIcon: () => <TabIcon name="♥" />,
        }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          tabBarLabel: t('nav.groups'),
          tabBarIcon: () => <TabIcon name="◉" />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('nav.profile'),
          tabBarIcon: () => <TabIcon name="☺" />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIcon: { alignItems: 'center', justifyContent: 'center' },
  tabIconText: { fontSize: 18 },
});
