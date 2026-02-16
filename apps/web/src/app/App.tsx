import { AuthProvider, I18nProvider, ThemeProvider, useI18n } from '@/app/providers';
import { LocationProvider } from '@/app/contexts/LocationContext';
import { AppRoutes } from '@/app/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/** Renders children only after initial i18n (locale + translations) has loaded; shows minimal splash until then. */
function I18nReadyGate({ children }: { children: React.ReactNode }) {
  const { ready } = useI18n();
  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F5FA] font-sans antialiased">
        <div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center border border-slate-100 mb-6">
          <span className="text-2xl text-slate-600">⊕</span>
        </div>
        <p className="text-xl font-semibold text-slate-800 tracking-tight">Pilgrimage</p>
        <div className="mt-6 h-8 w-8 border-2 border-slate-400 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <I18nProvider>
            <I18nReadyGate>
              <LocationProvider>
                <AppRoutes />
              </LocationProvider>
            </I18nReadyGate>
          </I18nProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
