import type { Metadata } from 'next';
import PrivacyPolicy from '@/app/pages/PrivacyPolicy';
import { buildStaticMetadata } from '@/lib/server/metadata';

export const metadata: Metadata = buildStaticMetadata('privacy');

export default function Page() {
  return <PrivacyPolicy />;
}
