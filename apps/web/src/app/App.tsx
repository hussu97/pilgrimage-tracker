import { AuthProvider, I18nProvider } from '@/app/providers';
import { AppRoutes } from '@/app/routes';

export default function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <AppRoutes />
      </I18nProvider>
    </AuthProvider>
  );
}
