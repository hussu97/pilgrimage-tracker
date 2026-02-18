import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { AuthProvider, I18nProvider, ThemeProvider, useAuth } from './providers';
import { LocationProvider } from './contexts/LocationContext';
import { AppNavigationContent } from './navigation';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AuthBottomSheetProvider } from '@/components/auth/AuthBottomSheet';

function AuthGate() {
  const { user, loading } = useAuth();
  return (
    <>
      <AppNavigationContent user={user} loading={loading} />
      <StatusBar style="auto" />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <I18nProvider>
          <ThemeProvider>
            <AuthProvider>
              <LocationProvider>
                <BottomSheetModalProvider>
                  <AuthBottomSheetProvider>
                    <AuthGate />
                  </AuthBottomSheetProvider>
                </BottomSheetModalProvider>
              </LocationProvider>
            </AuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
