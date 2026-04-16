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
    url: 'https://soul-step.org',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://soul-step.org/places?search={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SoulStep',
    url: 'https://soul-step.org',
    logo: 'https://soul-step.org/logo.png',
    sameAs: ['https://soul-step.org'],
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
