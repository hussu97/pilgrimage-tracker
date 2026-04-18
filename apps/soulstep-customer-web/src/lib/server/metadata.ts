// Server-side metadata builders.
// Used in generateMetadata() and <JsonLd> in route page.tsx files.
// DO NOT import in 'use client' components.

import type { Metadata } from 'next';
import type { BlogPostDetail, BlogPostSummary } from '@/lib/types/blog';
import type { PlaceForMeta } from './api';

const SITE_URL = 'https://www.soul-step.org';
const SITE_NAME = 'SoulStep';
const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.png`;

// ── Blog ─────────────────────────────────────────────────────────────────────

export function buildBlogMetadata(post: BlogPostSummary): Metadata {
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url,
      siteName: SITE_NAME,
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      images: [
        {
          url: post.cover_image_url ?? DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

export function buildBlogListMetadata(): Metadata {
  const url = `${SITE_URL}/blog`;
  const title = 'Blog — Spiritual Travel Guides';
  const description =
    'Discover in-depth guides to sacred sites, pilgrimage routes, and spiritual travel from around the world.';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export function buildBlogJsonLd(post: BlogPostDetail): Record<string, unknown>[] {
  const url = `${SITE_URL}/blog/${post.slug}`;

  const articleSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: {
      '@type': 'Organization',
      name: post.author_name ?? 'SoulStep Editorial Team',
      url: `${SITE_URL}/about`,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: DEFAULT_OG_IMAGE },
    },
    inLanguage: 'en',
  };

  if (post.word_count) articleSchema['wordCount'] = post.word_count;
  if (post.cover_image_url) articleSchema['image'] = post.cover_image_url;

  const schemas: Record<string, unknown>[] = [articleSchema];

  if (post.faq_json && post.faq_json.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: post.faq_json.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }

  return schemas;
}

// ── Places ────────────────────────────────────────────────────────────────────

const RELIGION_SCHEMA_TYPE: Record<string, string> = {
  islam: 'Mosque',
  christianity: 'Church',
  hinduism: 'HinduTemple',
  buddhism: 'BuddhistTemple',
  judaism: 'Synagogue',
  sikhism: 'Gurdwara',
  bahai: 'PlaceOfWorship',
  zoroastrianism: 'PlaceOfWorship',
};

export function buildPlaceMetadata(place: PlaceForMeta): Metadata {
  const slug = place.seo_slug;
  const url = slug
    ? `${SITE_URL}/places/${place.place_code}/${slug}`
    : `${SITE_URL}/places/${place.place_code}`;

  const title = place.seo_title ?? place.name;
  const description =
    place.seo_meta_description ?? place.description ?? `Explore ${place.name} on SoulStep.`;
  const image = place.seo_og_image_url ?? place.images?.[0]?.url ?? DEFAULT_OG_IMAGE;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: image }],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export function buildPlaceJsonLd(place: PlaceForMeta): Record<string, unknown>[] {
  const slug = place.seo_slug;
  const url = slug
    ? `${SITE_URL}/places/${place.place_code}/${slug}`
    : `${SITE_URL}/places/${place.place_code}`;

  const schemaType = RELIGION_SCHEMA_TYPE[place.religion ?? ''] ?? 'PlaceOfWorship';

  const placeSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', schemaType],
    additionalType: 'https://schema.org/TouristAttraction',
    name: place.name,
    url,
  };

  if (place.description || place.seo_meta_description) {
    placeSchema['description'] = place.seo_meta_description ?? place.description;
  }

  if (place.address) {
    placeSchema['address'] = {
      '@type': 'PostalAddress',
      streetAddress: place.address,
      ...(place.city ? { addressLocality: place.city } : {}),
      ...(place.country_iso_code
        ? { addressCountry: place.country_iso_code }
        : place.country
          ? { addressCountry: place.country }
          : {}),
    };
  }

  if (place.lat && place.lng) {
    placeSchema['geo'] = {
      '@type': 'GeoCoordinates',
      latitude: place.lat,
      longitude: place.lng,
    };
  }

  const imageUrl = place.seo_og_image_url ?? place.images?.[0]?.url;
  if (imageUrl) {
    placeSchema['image'] = imageUrl;
  }

  if (place.average_rating && place.review_count) {
    placeSchema['aggregateRating'] = {
      '@type': 'AggregateRating',
      ratingValue: Math.round(place.average_rating * 10) / 10,
      reviewCount: place.review_count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const schemas: Record<string, unknown>[] = [placeSchema];

  // Breadcrumb
  schemas.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Places', item: `${SITE_URL}/places` },
      { '@type': 'ListItem', position: 3, name: place.name, item: url },
    ],
  });

  // FAQ
  if (place.seo_faq_json && place.seo_faq_json.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: place.seo_faq_json.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }

  return schemas;
}

// ── City / Explore ────────────────────────────────────────────────────────────

export function buildCityMetadata(citySlug: string, cityName: string, count: number): Metadata {
  const label = cityName || citySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const url = `${SITE_URL}/explore/${citySlug}`;
  const title = `Sacred Sites in ${label}`;
  const description = `Discover ${count}+ mosques, temples, churches, and sacred sites in ${label}. Explore places of worship across all religions on SoulStep.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url, siteName: SITE_NAME },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export function buildCityReligionMetadata(
  citySlug: string,
  cityName: string,
  religion: string,
  count: number,
): Metadata {
  const label = cityName || citySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const relLabel = religion.charAt(0).toUpperCase() + religion.slice(1);
  const url = `${SITE_URL}/explore/${citySlug}/${religion}`;
  const title = `${relLabel} Sacred Sites in ${label}`;
  const description = `Discover ${count}+ ${relLabel.toLowerCase()} places of worship in ${label} on SoulStep.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url, siteName: SITE_NAME },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ── Static pages ──────────────────────────────────────────────────────────────

const STATIC_META = {
  about: {
    title: 'About SoulStep',
    description:
      'Learn about SoulStep — the sacred sites discovery platform connecting spiritual travelers with mosques, temples, churches, and places of worship worldwide.',
    alternates: { canonical: `${SITE_URL}/about` },
    openGraph: {
      type: 'website' as const,
      title: 'About SoulStep',
      description: 'Learn about SoulStep — the sacred sites discovery platform.',
      url: `${SITE_URL}/about`,
      siteName: SITE_NAME,
    },
  },
  privacy: {
    title: 'Privacy Policy',
    description:
      'Read the SoulStep Privacy Policy — how we collect, use, and protect your personal data.',
    alternates: { canonical: `${SITE_URL}/privacy` },
    openGraph: {
      type: 'website' as const,
      title: 'Privacy Policy | SoulStep',
      description: 'How SoulStep collects, uses, and protects your data.',
      url: `${SITE_URL}/privacy`,
      siteName: SITE_NAME,
    },
  },
  terms: {
    title: 'Terms of Service',
    description:
      "Read SoulStep's Terms of Service — the rules and guidelines for using our platform.",
    alternates: { canonical: `${SITE_URL}/terms` },
    openGraph: {
      type: 'website' as const,
      title: 'Terms of Service | SoulStep',
      description: "SoulStep's Terms of Service.",
      url: `${SITE_URL}/terms`,
      siteName: SITE_NAME,
    },
  },
  contact: {
    title: 'Contact Us',
    description:
      'Get in touch with the SoulStep team. We welcome your questions, feedback, and partnership enquiries.',
    alternates: { canonical: `${SITE_URL}/contact` },
    openGraph: {
      type: 'website' as const,
      title: 'Contact SoulStep',
      description: 'Reach out to the SoulStep team.',
      url: `${SITE_URL}/contact`,
      siteName: SITE_NAME,
    },
  },
  developers: {
    title: 'Developers — SoulStep API',
    description:
      'Integrate sacred site data into your app with the SoulStep API. Thousands of verified places of worship with rich metadata.',
    alternates: { canonical: `${SITE_URL}/developers` },
    openGraph: {
      type: 'website' as const,
      title: 'SoulStep Developer API',
      description: 'Sacred site data for developers.',
      url: `${SITE_URL}/developers`,
      siteName: SITE_NAME,
    },
  },
  home: {
    title: 'SoulStep — Sacred Sites Discovery Platform',
    description:
      'Discover sacred sites, mosques, temples, churches, and places of worship worldwide. Track your spiritual journey and explore religious heritage with SoulStep.',
    alternates: { canonical: SITE_URL },
    openGraph: {
      type: 'website' as const,
      title: 'SoulStep — Sacred Sites Discovery Platform',
      description: 'Discover mosques, temples, churches, and sacred sites worldwide.',
      url: SITE_URL,
      siteName: SITE_NAME,
    },
  },
  places: {
    title: 'Sacred Sites — Browse All Places',
    description:
      'Browse 1,900+ verified mosques, temples, churches, gurdwaras, synagogues, and sacred sites worldwide. Filter by religion, city, and rating on SoulStep.',
    alternates: { canonical: `${SITE_URL}/places` },
    openGraph: {
      type: 'website' as const,
      title: 'Sacred Sites — Browse All Places | SoulStep',
      description: 'Browse 1,900+ verified sacred sites worldwide.',
      url: `${SITE_URL}/places`,
      siteName: SITE_NAME,
    },
  },
  explore: {
    title: 'Explore Sacred Sites by City',
    description:
      'Explore mosques, temples, churches, and sacred sites by city. Discover spiritual destinations across the Middle East, South Asia, and beyond on SoulStep.',
    alternates: { canonical: `${SITE_URL}/explore` },
    openGraph: {
      type: 'website' as const,
      title: 'Explore Sacred Sites by City | SoulStep',
      description: 'Find places of worship by city and country on SoulStep.',
      url: `${SITE_URL}/explore`,
      siteName: SITE_NAME,
    },
  },
} satisfies Record<string, Metadata>;

export function buildStaticMetadata(key: keyof typeof STATIC_META): Metadata {
  return STATIC_META[key];
}
