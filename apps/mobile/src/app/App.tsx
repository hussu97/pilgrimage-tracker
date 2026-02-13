import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, I18nProvider, ThemeProvider, useAuth } from './providers';
import { LocationProvider } from './contexts/LocationContext';
import { AppNavigationContent } from './navigation';

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
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <LocationProvider>
            <AuthGate />
          </LocationProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
