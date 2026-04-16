import EditProfile from '@/app/pages/EditProfile';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return <EditProfile />;
}
