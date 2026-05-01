import WriteReview from '@/app/pages/WriteReview';
import { QueryParamPageShell } from '../../../../../AppClientShell';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <QueryParamPageShell>
      <ProtectedRoute>
        <WriteReview />
      </ProtectedRoute>
    </QueryParamPageShell>
  );
}
