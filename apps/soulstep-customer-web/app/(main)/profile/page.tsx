import Profile from '@/app/pages/Profile';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Profile />;
}
