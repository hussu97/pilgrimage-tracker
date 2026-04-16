import EditGroup from '@/app/pages/EditGroup';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <ProtectedRoute>
      <EditGroup />
    </ProtectedRoute>
  );
}
