import WriteReview from '@/app/pages/WriteReview';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <WriteReview />
    </ProtectedRoute>
  );
}
