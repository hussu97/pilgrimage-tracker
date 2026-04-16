import CheckInsList from '@/app/pages/CheckInsList';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <ProtectedRoute>
      <CheckInsList />
    </ProtectedRoute>
  );
}
