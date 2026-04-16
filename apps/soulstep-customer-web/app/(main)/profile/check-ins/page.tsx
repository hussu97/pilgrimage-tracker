import CheckInsList from '@/app/pages/CheckInsList';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <CheckInsList />
    </ProtectedRoute>
  );
}
