import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Layout from '@/components/layout/Layout';
import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import SelectPathScreen from './screens/SelectPathScreen';
import HomeScreen from './screens/HomeScreen';
import PlaceDetailScreen from './screens/PlaceDetailScreen';
import WriteReviewScreen from './screens/WriteReviewScreen';
import ProfileScreen from './screens/ProfileScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import CheckInsListScreen from './screens/CheckInsListScreen';
import FavoritesScreen from './screens/FavoritesScreen';
import GroupsScreen from './screens/GroupsScreen';
import CreateGroupScreen from './screens/CreateGroupScreen';
import GroupDetailScreen from './screens/GroupDetailScreen';
import JoinGroupScreen from './screens/JoinGroupScreen';
import NotificationsScreen from './screens/NotificationsScreen';

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
  Main: undefined;
  SelectPath: undefined;
  PlaceDetail: { placeCode: string };
  WriteReview: { placeCode: string; reviewCode?: string; rating?: number; title?: string; body?: string };
  EditProfile: undefined;
  CheckInsList: undefined;
  CreateGroup: undefined;
  GroupDetail: { groupCode: string };
  JoinGroup: { inviteCode?: string };
  Notifications: undefined;
  Favorites: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Single root stack: Splash (loading) then Main (Home). Auth screens are in the same stack for "Sign in" from Home. */
function RootStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Main" component={Layout} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="SelectPath" component={SelectPathScreen} />
      <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
      <Stack.Screen name="WriteReview" component={WriteReviewScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="CheckInsList" component={CheckInsListScreen} />
      <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
      <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
      <Stack.Screen name="JoinGroup" component={JoinGroupScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigationContent({
  user,
  loading,
}: {
  user: unknown;
  loading: boolean;
}) {
  if (loading) return null;
  return (
    <NavigationContainer>
      <RootStack />
    </NavigationContainer>
  );
}
