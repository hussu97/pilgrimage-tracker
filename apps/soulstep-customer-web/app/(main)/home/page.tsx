import type { Metadata } from 'next';
import Home from '@/app/pages/Home';
import { JsonLd } from '@/components/server/JsonLd';
import { buildStaticMetadata } from '@/lib/server/metadata';

export const metadata: Metadata = buildStaticMetadata('home');

const WEBSITE_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'SoulStep',
    url: 'https://www.soul-step.org',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://www.soul-step.org/places?search={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SoulStep',
    url: 'https://www.soul-step.org',
    logo: 'https://www.soul-step.org/logo.png',
    sameAs: ['https://www.soul-step.org'],
  },
];

export default function Page() {
  return (
    <>
      <JsonLd schemas={WEBSITE_JSONLD} />
      <Home />
    </>
  );
}
