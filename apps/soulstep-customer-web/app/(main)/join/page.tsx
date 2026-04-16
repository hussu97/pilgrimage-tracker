import JoinGroup from '@/app/pages/JoinGroup';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <JoinGroup />
    </ProtectedRoute>
  );
}
