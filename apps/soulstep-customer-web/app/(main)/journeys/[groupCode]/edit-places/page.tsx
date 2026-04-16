import EditGroupPlaces from '@/app/pages/EditGroupPlaces';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <ProtectedRoute>
      <EditGroupPlaces />
    </ProtectedRoute>
  );
}
