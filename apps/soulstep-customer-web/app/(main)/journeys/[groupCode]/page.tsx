import GroupDetail from '@/app/pages/GroupDetail';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <GroupDetail />
    </ProtectedRoute>
  );
}
