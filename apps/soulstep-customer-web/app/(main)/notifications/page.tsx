import Notifications from '@/app/pages/Notifications';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <Notifications />
    </ProtectedRoute>
  );
}
