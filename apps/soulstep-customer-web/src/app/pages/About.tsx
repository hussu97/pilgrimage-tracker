import { Link } from 'react-router-dom';
import { useHead } from '@/lib/hooks/useHead';

const religions = [
  { name: 'Islam', placeType: 'Mosques', icon: 'mosque' },
  { name: 'Christianity', placeType: 'Churches', icon: 'church' },
  { name: 'Hinduism', placeType: 'Temples', icon: 'temple_hindu' },
  { name: 'Buddhism', placeType: 'Monasteries', icon: 'temple_buddhist' },
  { name: 'Sikhism', placeType: 'Gurdwaras', icon: 'place' },
  { name: 'Judaism', placeType: 'Synagogues', icon: 'synagogue' },
  { name: 'Baha\'i', placeType: 'Houses of Worship', icon: 'place' },
  { name: 'Zoroastrianism', placeType: 'Fire Temples', icon: 'place' },
];

const features = [
  {
    icon: 'explore',
    title: 'Discover Sacred Sites',
    description:
      'Browse thousands of mosques, temples, churches, gurdwaras, synagogues, and other houses of worship across the globe.',
  },
  {
    icon: 'check_circle',
    title: 'Check In at Locations',
    description:
      'Record your visits to sacred sites and build a personal history of the places you have experienced.',
  },
  {
    icon: 'rate_review',
    title: 'Share Reviews',
    description:
      'Write reviews and rate places to help fellow travelers find welcoming and well-maintained sites.',
  },
  {
    icon: 'group',
    title: 'Create Journey Groups',
    description:
      'Plan pilgrimages and spiritual journeys with friends, family, or community members in shared groups.',
  },
  {
    icon: 'map',
    title: 'Interactive Map',
    description:
      'Explore an interactive map to find sacred sites near you or anywhere in the world, filterable by religion and rating.',
  },
];

const dataSources = [
  { name: 'Google Maps', description: 'Location data, photos, and opening hours' },
  { name: 'OpenStreetMap', description: 'Geographic data and community-contributed details' },
  { name: 'Wikipedia', description: 'Historical context and descriptions' },
  { name: 'Wikidata', description: 'Structured metadata and cross-references' },
];

export default function About() {
  useHead({
    title: 'About SoulStep',
    description:
      'Learn about SoulStep — the sacred sites discovery platform connecting spiritual travelers with mosques, temples, churches, and places of worship worldwide.',
    canonicalUrl: 'https://soul-step.org/about',
    ogType: 'website',
    ogTitle: 'About SoulStep — Sacred Sites Discovery Platform',
    ogDescription:
      'Discover how SoulStep connects spiritual travelers with sacred sites across 8 religions worldwide.',
    ogUrl: 'https://soul-step.org/about',
    twitterCard: 'summary',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'SoulStep',
        url: 'https://soul-step.org',
        description:
          'Sacred sites discovery platform connecting spiritual travelers with places of worship worldwide.',
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'contact@soul-step.org',
          contactType: 'customer support',
        },
      },
    ],
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-text-main dark:text-white mb-3">About SoulStep</h1>
      <p className="text-lg text-text-secondary dark:text-dark-text-secondary mb-8">
        The sacred sites discovery platform for spiritual travelers worldwide.
      </p>

      {/* Our Mission */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">Our Mission</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            SoulStep was created to connect spiritual travelers with sacred sites around the world.
            Whether you are embarking on a pilgrimage, exploring the religious heritage of a new
            city, or simply looking for a nearby house of worship, SoulStep makes it easy to
            discover, visit, and share these meaningful places.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            We believe that religious heritage belongs to everyone. Our goal is to make sacred sites
            accessible and discoverable — preserving their stories, celebrating their architecture,
            and helping travelers of all faiths find the places that matter most to them.
          </p>
        </div>
      </section>

      {/* What We Offer */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">What We Offer</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5"
            >
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary text-2xl mt-0.5">
                  {feature.icon}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-text-main dark:text-white mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-text-secondary dark:text-dark-text-secondary leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Religions We Cover */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          Religions We Cover
        </h2>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
          SoulStep covers sacred sites across eight major world religions, with thousands of
          verified locations worldwide.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {religions.map((religion) => (
            <div
              key={religion.name}
              className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-4 text-center"
            >
              <span className="material-symbols-outlined text-primary text-3xl mb-2 block">
                {religion.icon}
              </span>
              <h3 className="text-sm font-semibold text-text-main dark:text-white">
                {religion.name}
              </h3>
              <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
                {religion.placeType}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Our Data */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">Our Data</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            SoulStep aggregates data from multiple trusted sources to provide accurate, up-to-date
            information about sacred sites worldwide. Our data is continuously updated and enriched
            with community contributions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {dataSources.map((source) => (
              <div key={source.name} className="flex items-start gap-2">
                <span className="material-symbols-outlined text-primary text-base mt-0.5">
                  database
                </span>
                <div>
                  <span className="text-sm font-medium text-text-main dark:text-white">
                    {source.name}
                  </span>
                  <p className="text-xs text-text-secondary dark:text-dark-text-secondary">
                    {source.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Available Everywhere */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          Available Everywhere
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            Access SoulStep wherever you are. Use our web app at{' '}
            <a
              href="https://soul-step.org"
              className="text-primary hover:underline font-medium"
              target="_blank"
              rel="noopener noreferrer"
            >
              soul-step.org
            </a>{' '}
            from any browser, or download our mobile apps for iOS and Android to discover sacred
            sites on the go.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">language</span>
              <span className="text-sm text-text-main dark:text-white font-medium">Web App</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">
                phone_iphone
              </span>
              <span className="text-sm text-text-main dark:text-white font-medium">iOS</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">
                phone_android
              </span>
              <span className="text-sm text-text-main dark:text-white font-medium">Android</span>
            </div>
          </div>
        </div>
      </section>

      {/* Open Data */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">Open Data</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            SoulStep provides a public API for developers and researchers who want to build on our
            sacred sites data. Access place information, filter by religion and location, and
            integrate sacred site data into your own applications.
          </p>
          <Link
            to="/developers"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            <span className="material-symbols-outlined text-base">code</span>
            Explore the API
          </Link>
        </div>
      </section>

      {/* Contact Us */}
      <section>
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">Contact Us</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-3">
            Have a question, suggestion, or want to get involved? We would love to hear from you.
          </p>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-lg">mail</span>
            <a
              href="mailto:contact@soul-step.org"
              className="text-sm text-primary hover:underline font-medium"
            >
              contact@soul-step.org
            </a>
          </div>
          <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-3">
            You can also visit our{' '}
            <Link to="/contact" className="text-primary hover:underline">
              Contact page
            </Link>{' '}
            for more ways to reach us.
          </p>
        </div>
      </section>
    </div>
  );
}
