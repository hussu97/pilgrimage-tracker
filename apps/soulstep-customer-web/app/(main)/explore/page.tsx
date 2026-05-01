import type { Metadata } from 'next';
import ExploreCities from '@/app/pages/ExploreCities';
import { buildStaticMetadata } from '@/lib/server/metadata';
import { ExploreEditorialContent } from '../_components/PublicEditorialContent';

export const metadata: Metadata = buildStaticMetadata('explore');

export default function Page() {
  return (
    <>
      <ExploreCities />
      <ExploreEditorialContent />
    </>
  );
}
