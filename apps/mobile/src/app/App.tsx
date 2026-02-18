import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
    <SafeAreaProvider>
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            <LocationProvider>
              <AuthBottomSheetProvider>
                <AuthGate />
              </AuthBottomSheetProvider>
            </LocationProvider>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}
