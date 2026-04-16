import type { Metadata } from 'next';
import Contact from '@/app/pages/Contact';
import { buildStaticMetadata } from '@/lib/server/metadata';

export const metadata: Metadata = buildStaticMetadata('contact');

export default function Page() {
  return <Contact />;
}
