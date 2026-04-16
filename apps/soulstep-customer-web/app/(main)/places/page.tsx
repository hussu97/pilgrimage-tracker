import type { Metadata } from 'next';
import PlacesIndex from '@/app/pages/Places';
import { buildStaticMetadata } from '@/lib/server/metadata';

export const metadata: Metadata = buildStaticMetadata('places');

export default function Page() {
  return <PlacesIndex />;
}
