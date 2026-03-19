import React, { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { UmamiTrackerConnected } from '@/components/analytics/UmamiTrackerConnected';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import Layout from '@/components/layout/Layout';
import SplashScreen from './screens/SplashScreen';
// Eagerly import HomeScreen since it's needed immediately after splash
import HomeScreen from './screens/HomeScreen';

// Lazy-load all secondary screens to reduce initial JS parse time
const LoginScreen = React.lazy(() => import('./screens/LoginScreen'));
const RegisterScreen = React.lazy(() => import('./screens/RegisterScreen'));
const ForgotPasswordScreen = React.lazy(() => import('./screens/ForgotPasswordScreen'));
const ResetPasswordScreen = React.lazy(() => import('./screens/ResetPasswordScreen'));
const PlaceDetailScreen = React.lazy(() => import('./screens/PlaceDetailScreen'));
const WriteReviewScreen = React.lazy(() => import('./screens/WriteReviewScreen'));
const ProfileScreen = React.lazy(() => import('./screens/ProfileScreen'));
const CheckInsListScreen = React.lazy(() => import('./screens/CheckInsListScreen'));
const FavoritesScreen = React.lazy(() => import('./screens/FavoritesScreen'));
const CreateGroupScreen = React.lazy(() => import('./screens/CreateGroupScreen'));
const GroupDetailScreen = React.lazy(() => import('./screens/GroupDetailScreen'));
const JoinGroupScreen = React.lazy(() => import('./screens/JoinGroupScreen'));
const EditGroupScreen = React.lazy(() => import('./screens/EditGroupScreen'));
const EditGroupPlacesScreen = React.lazy(() => import('./screens/EditGroupPlacesScreen'));
const NotificationsScreen = React.lazy(() => import('./screens/NotificationsScreen'));
const SearchScreen = React.lazy(() => import('./screens/SearchScreen'));
const ExploreCitiesScreen = React.lazy(() => import('./screens/ExploreCitiesScreen'));
const ExploreCityScreen = React.lazy(() => import('./screens/ExploreCityScreen'));
const PlacesScreen = React.lazy(() => import('./screens/PlacesScreen'));
const MapDiscoveryScreen = React.lazy(() => import('./screens/MapDiscoveryScreen'));
const OnboardingScreen = React.lazy(() => import('./screens/OnboardingScreen'));
const EditProfileScreen = React.lazy(() => import('./screens/EditProfileScreen'));

function LazyFallback() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="small" />
    </View>
  );
}

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
  Main: undefined;
  Search: undefined;
  PlaceDetail: { placeCode: string; slug?: string };
  ExploreCities: undefined;
  ExploreCity: { citySlug: string; cityName?: string };
  Places: undefined;
  WriteReview: {
    placeCode: string;
    reviewCode?: string;
    rating?: number;
    title?: string;
    body?: string;
  };
  CheckInsList: undefined;
  // Journey screens (customer-facing name; backend model is "Group")
  CreateGroup: undefined; // used for new journey creation flow
  GroupDetail: { groupCode: string }; // journey detail
  EditGroup: { groupCode: string }; // edit journey metadata
  EditGroupPlaces: { groupCode: string }; // edit journey itinerary
  JoinGroup: { inviteCode?: string }; // join a journey
  Notifications: undefined;
  Favorites: undefined;
  MapDiscovery: undefined;
  Onboarding: undefined;
  EditProfile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Wraps a screen component in an ErrorBoundary so a crash in one screen
 * shows a "Retry" fallback without taking down the entire navigator.
 */
function withScreenBoundary<T extends object>(
  Screen: React.ComponentType<T>,
): React.ComponentType<T> {
  return function BoundedScreen(props: T) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LazyFallback />}>
          <Screen {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  };
}

/** Single root stack: Splash (loading) then Main (Home). Auth screens are in the same stack for "Sign in" from Home. */
function RootStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Main" component={Layout} />
      <Stack.Screen name="Login" component={withScreenBoundary(LoginScreen)} />
      <Stack.Screen name="Register" component={withScreenBoundary(RegisterScreen)} />
      <Stack.Screen name="ForgotPassword" component={withScreenBoundary(ForgotPasswordScreen)} />
      <Stack.Screen name="ResetPassword" component={withScreenBoundary(ResetPasswordScreen)} />
      <Stack.Screen name="PlaceDetail" component={withScreenBoundary(PlaceDetailScreen)} />
      <Stack.Screen name="WriteReview" component={withScreenBoundary(WriteReviewScreen)} />
      <Stack.Screen name="CheckInsList" component={withScreenBoundary(CheckInsListScreen)} />
      <Stack.Screen name="CreateGroup" component={withScreenBoundary(CreateGroupScreen)} />
      <Stack.Screen name="GroupDetail" component={withScreenBoundary(GroupDetailScreen)} />
      <Stack.Screen name="EditGroup" component={withScreenBoundary(EditGroupScreen)} />
      <Stack.Screen name="EditGroupPlaces" component={withScreenBoundary(EditGroupPlacesScreen)} />
      <Stack.Screen name="JoinGroup" component={withScreenBoundary(JoinGroupScreen)} />
      <Stack.Screen name="Notifications" component={withScreenBoundary(NotificationsScreen)} />
      <Stack.Screen name="Favorites" component={withScreenBoundary(FavoritesScreen)} />
      <Stack.Screen name="Search" component={withScreenBoundary(SearchScreen)} />
      <Stack.Screen name="ExploreCities" component={withScreenBoundary(ExploreCitiesScreen)} />
      <Stack.Screen name="ExploreCity" component={withScreenBoundary(ExploreCityScreen)} />
      <Stack.Screen name="Places" component={withScreenBoundary(PlacesScreen)} />
      <Stack.Screen name="MapDiscovery" component={withScreenBoundary(MapDiscoveryScreen)} />
      <Stack.Screen name="Onboarding" component={withScreenBoundary(OnboardingScreen)} />
      <Stack.Screen name="EditProfile" component={withScreenBoundary(EditProfileScreen)} />
    </Stack.Navigator>
  );
}

export function AppNavigationContent({ user, loading }: { user: unknown; loading: boolean }) {
  if (loading) return null;
  return (
    <NavigationContainer>
      <UmamiTrackerConnected />
      <RootStack />
    </NavigationContainer>
  );
}
