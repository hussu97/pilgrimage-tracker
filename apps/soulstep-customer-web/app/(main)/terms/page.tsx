import type { Metadata } from 'next';
import TermsOfService from '@/app/pages/TermsOfService';
import { buildStaticMetadata } from '@/lib/server/metadata';

export const metadata: Metadata = buildStaticMetadata('terms');

export default function Page() {
  return <TermsOfService />;
}
