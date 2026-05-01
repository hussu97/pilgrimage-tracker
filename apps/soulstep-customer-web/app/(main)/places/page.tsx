import type { Metadata } from 'next';
import PlacesIndex from '@/app/pages/Places';
import { buildStaticMetadata } from '@/lib/server/metadata';
import { PlacesEditorialContent } from '../_components/PublicEditorialContent';

export const metadata: Metadata = buildStaticMetadata('places');

export default function Page() {
  return (
    <>
      <PlacesIndex />
      <PlacesEditorialContent />
    </>
  );
}
