'use client';

import { useHead } from '@/lib/hooks/useHead';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://catalog-api.soul-step.org';

export default function Developers() {
  useHead({
    title: 'SoulStep API — Sacred Sites Data for Developers',
    description:
      "Access SoulStep's sacred sites API. Filter by religion, location, and ratings. OpenAPI 3.1 spec available. Free for research and educational use.",
    canonicalUrl: 'https://soul-step.org/developers',
    ogType: 'website',
    ogTitle: 'SoulStep API — Sacred Sites Data for Developers',
    ogDescription:
      'Access sacred sites data via REST API. Filter by religion, location, and ratings.',
    ogUrl: 'https://soul-step.org/developers',
    twitterCard: 'summary',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebAPI',
        name: 'SoulStep Sacred Sites API',
        description:
          'REST API for discovering sacred sites, mosques, temples, churches, and places of worship worldwide.',
        url: 'https://soul-step.org/developers',
        documentation: `${API_BASE}/docs`,
        provider: {
          '@type': 'Organization',
          name: 'SoulStep',
          url: 'https://soul-step.org',
        },
        license: 'https://creativecommons.org/licenses/by/4.0/',
      },
    ],
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-text-main dark:text-white mb-3">SoulStep API</h1>
      <p className="text-lg text-text-secondary dark:text-dark-text-secondary mb-8">
        Sacred sites data for developers, researchers, and community apps.
      </p>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">Getting Started</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            The SoulStep API is publicly accessible. No authentication required for read-only
            access.
          </p>
          <div className="flex gap-3">
            <a
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              Interactive Docs
            </a>
            <a
              href={`${API_BASE}/openapi.json`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-dark-bg text-text-main dark:text-white text-sm font-medium hover:bg-slate-200 dark:hover:bg-dark-border transition-colors"
            >
              OpenAPI 3.1 Spec
            </a>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-4">Key Endpoints</h2>
        <div className="space-y-3">
          {[
            {
              method: 'GET',
              path: '/api/v1/places',
              desc: 'List and filter sacred sites. Supports religion, location, radius, open_now, top_rated filters.',
            },
            {
              method: 'GET',
              path: '/api/v1/places/{place_code}',
              desc: 'Full place detail: address, opening hours, photos, ratings, prayer times, specifications.',
            },
            {
              method: 'GET',
              path: '/api/v1/search?q={query}',
              desc: 'Text search across place names and addresses.',
            },
            {
              method: 'GET',
              path: '/api/v1/cities',
              desc: 'List all cities with place counts for city-level exploration.',
            },
            {
              method: 'GET',
              path: '/sitemap.xml',
              desc: 'Full sitemap of all places including image extensions.',
            },
          ].map((ep) => (
            <div
              key={ep.path}
              className="rounded-xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-4"
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 px-2 py-0.5 rounded text-xs font-bold bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-800/30">
                  {ep.method}
                </span>
                <div>
                  <code className="text-sm font-mono text-primary">{ep.path}</code>
                  <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-1">
                    {ep.desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-4">Example Requests</h2>
        <div className="space-y-4">
          {[
            {
              title: 'Find mosques near a location',
              code: `curl "${API_BASE}/api/v1/places?religion=islam&lat=25.197&lng=55.279&radius=5"`,
            },
            {
              title: 'Top-rated temples',
              code: `curl "${API_BASE}/api/v1/places?religion=hinduism&sort=rating&top_rated=true"`,
            },
            {
              title: 'Currently open churches',
              code: `curl "${API_BASE}/api/v1/places?religion=christianity&open_now=true"`,
            },
          ].map((ex) => (
            <div key={ex.title}>
              <p className="text-sm font-medium text-text-main dark:text-white mb-1">{ex.title}</p>
              <pre className="text-xs bg-slate-50 dark:bg-dark-bg border border-slate-100 dark:border-dark-border rounded-xl p-4 overflow-x-auto font-mono text-text-secondary dark:text-dark-text-secondary">
                {ex.code}
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">Data License</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            Place data is sourced from Google Maps, OpenStreetMap, Wikipedia, and Wikidata. Data is
            available under{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Creative Commons Attribution 4.0
            </a>
            . Attribution: "Data from SoulStep (soul-step.org)".
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">Use Cases</h2>
        <ul className="space-y-2 text-sm text-text-secondary dark:text-dark-text-secondary">
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-primary text-base mt-0.5">
              check_circle
            </span>
            Academic research on religious geography and sacred site distribution
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-primary text-base mt-0.5">
              check_circle
            </span>
            Travel apps and religious tourism platforms
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-primary text-base mt-0.5">
              check_circle
            </span>
            Community apps for religious organizations
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-primary text-base mt-0.5">
              check_circle
            </span>
            Data journalism and mapping projects
          </li>
        </ul>
      </section>
    </div>
  );
}
