import EditGroupPlaces from '@/app/pages/EditGroupPlaces';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <EditGroupPlaces />
    </ProtectedRoute>
  );
}
