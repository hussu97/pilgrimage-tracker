import { AuthProvider, I18nProvider } from '@/app/providers';
import { LocationProvider } from '@/app/contexts/LocationContext';
import { AppRoutes } from '@/app/routes';

export default function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <LocationProvider>
          <AppRoutes />
        </LocationProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
