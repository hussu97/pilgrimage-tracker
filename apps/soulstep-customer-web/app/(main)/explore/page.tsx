import type { Metadata } from 'next';
import ExploreCities from '@/app/pages/ExploreCities';
import { buildStaticMetadata } from '@/lib/server/metadata';

export const metadata: Metadata = buildStaticMetadata('explore');

export default function Page() {
  return <ExploreCities />;
}
