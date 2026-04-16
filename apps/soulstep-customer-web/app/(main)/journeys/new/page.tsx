import CreateGroup from '@/app/pages/CreateGroup';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <CreateGroup />
    </ProtectedRoute>
  );
}
