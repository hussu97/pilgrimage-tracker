'use client';

import { Navigate, useLocation } from '@/lib/navigation';
import { useAuth, useI18n } from '@/app/providers';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-text-muted dark:text-dark-text-secondary">{t('common.loading')}</p>
      </div>
    );
  }

  if (!user) {
    // Pass the original destination as a query param so Login can redirect back.
    // Next.js App Router does not support history state, so we use ?from=<path>.
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  return <>{children}</>;
}
