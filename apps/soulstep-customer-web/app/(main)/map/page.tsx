import type { Metadata } from 'next';
import MapDiscovery from '@/app/pages/MapDiscovery';

export const metadata: Metadata = {
  title: 'Interactive Sacred Sites Map',
  description:
    'Use SoulStep map tools to discover nearby mosques, temples, churches, and sacred sites.',
  robots: { index: false, follow: true },
};

export default function Page() {
  return <MapDiscovery />;
}
