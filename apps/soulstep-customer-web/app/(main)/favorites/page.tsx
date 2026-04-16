import Favorites from '@/app/pages/Favorites';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <Favorites />
    </ProtectedRoute>
  );
}
