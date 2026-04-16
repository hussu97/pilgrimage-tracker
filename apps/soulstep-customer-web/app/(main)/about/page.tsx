import type { Metadata } from 'next';
import About from '@/app/pages/About';
import { buildStaticMetadata } from '@/lib/server/metadata';

export const metadata: Metadata = buildStaticMetadata('about');

export default function Page() {
  return <About />;
}
