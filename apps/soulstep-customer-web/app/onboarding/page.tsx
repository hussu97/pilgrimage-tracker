import type { Metadata } from 'next';
import Onboarding from '@/app/pages/Onboarding';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Onboarding />;
}
