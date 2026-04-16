import Groups from '@/app/pages/Groups';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Groups />;
}
