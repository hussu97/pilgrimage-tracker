import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  AuthProvider,
  FeedbackProvider,
  I18nProvider,
  SearchProvider,
  ThemeProvider,
  useAuth,
} from './providers';
import { LocationProvider } from './contexts/LocationContext';
import { AppNavigationContent } from './navigation';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AuthBottomSheetProvider } from '@/components/auth/AuthBottomSheet';
import OfflineBanner from '@/components/common/OfflineBanner';
import ForceUpdateModal from '@/components/common/ForceUpdateModal';
import { UpdateProvider, useUpdate } from '@/lib/updateContext';
import {
  getAppVersion,
  registerForceUpdateCallback,
  unregisterForceUpdateCallback,
} from '@/lib/api/client';
import { shouldSoftUpdate } from '@/lib/utils/versionUtils';

const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';

function UpdateSetup() {
  const { triggerForceUpdate, triggerSoftUpdate } = useUpdate();

  // Register the force-update callback so authFetch can trigger it on 426
  useEffect(() => {
    registerForceUpdateCallback(triggerForceUpdate);
    return () => unregisterForceUpdateCallback();
  }, [triggerForceUpdate]);

  // On mount, check server version config for soft-update banner
  useEffect(() => {
    const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
    getAppVersion(platform)
      .then((data) => {
        if (shouldSoftUpdate(APP_VERSION, data.min_version_soft)) {
          triggerSoftUpdate(data.store_url);
        }
      })
      .catch(() => {
        // Version check is non-critical — silently ignore network errors
      });
  }, [triggerSoftUpdate]);

  return null;
}

function AuthGate() {
  const { user, loading } = useAuth();
  return (
    <>
      <AppNavigationContent user={user} loading={loading} />
      <OfflineBanner />
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
            <UpdateProvider>
              <UpdateSetup />
              <AuthProvider>
                <LocationProvider>
                  <SearchProvider>
                    <AuthBottomSheetProvider>
                      <FeedbackProvider>
                        <AuthGate />
                      </FeedbackProvider>
                    </AuthBottomSheetProvider>
                  </SearchProvider>
                </LocationProvider>
              </AuthProvider>
              {/* ForceUpdateModal renders above everything — no dismiss option */}
              <ForceUpdateModal />
            </UpdateProvider>
          </ThemeProvider>
        </I18nProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
