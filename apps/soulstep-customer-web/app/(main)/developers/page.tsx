import type { Metadata } from 'next';
import Developers from '@/app/pages/Developers';
import { buildStaticMetadata } from '@/lib/server/metadata';

export const metadata: Metadata = buildStaticMetadata('developers');

export default function Page() {
  return <Developers />;
}
