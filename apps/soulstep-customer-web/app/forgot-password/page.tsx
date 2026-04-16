import ForgotPassword from '@/app/pages/ForgotPassword';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ForgotPassword />;
}
