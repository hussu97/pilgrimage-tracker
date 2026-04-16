import EditGroup from '@/app/pages/EditGroup';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <EditGroup />
    </ProtectedRoute>
  );
}
