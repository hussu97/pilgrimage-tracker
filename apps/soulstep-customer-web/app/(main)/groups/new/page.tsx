import CreateGroup from '@/app/pages/CreateGroup';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <ProtectedRoute>
      <CreateGroup />
    </ProtectedRoute>
  );
}
