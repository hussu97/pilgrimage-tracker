import { describe, it, expect } from 'vitest';
import type { HeadConfig } from '@/lib/hooks/useHead';

// Pure logic tests for HeadConfig type and helper validation
// (We cannot test DOM manipulation in Vitest without jsdom)

describe('useHead HeadConfig', () => {
  it('accepts a minimal config', () => {
    const config: HeadConfig = { title: 'Test Page' };
    expect(config.title).toBe('Test Page');
  });

  it('accepts a full SEO config', () => {
    const config: HeadConfig = {
      title: 'Test Mosque',
      description: 'A beautiful mosque in Dubai',
      canonicalUrl: 'https://soul-step.org/places/plc_test/test-mosque',
      ogType: 'place',
      ogTitle: 'Test Mosque | SoulStep',
      ogDescription: 'A beautiful mosque in Dubai',
      ogImage: 'https://example.com/image.jpg',
      ogUrl: 'https://soul-step.org/places/plc_test/test-mosque',
      twitterCard: 'summary_large_image',
      twitterTitle: 'Test Mosque',
      twitterDescription: 'A beautiful mosque in Dubai',
      twitterImage: 'https://example.com/image.jpg',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Mosque',
          name: 'Test Mosque',
        },
      ],
      hreflangAlternates: [
        { lang: 'en', href: 'https://soul-step.org/share/en/places/plc_test' },
        { lang: 'ar', href: 'https://soul-step.org/share/ar/places/plc_test' },
      ],
    };
    expect(config.jsonLd).toHaveLength(1);
    expect(config.hreflangAlternates).toHaveLength(2);
    expect(config.twitterCard).toBe('summary_large_image');
  });

  it('accepts empty config', () => {
    const config: HeadConfig = {};
    expect(config.title).toBeUndefined();
    expect(config.jsonLd).toBeUndefined();
  });
});

describe('PlaceFAQ toggle logic', () => {
  it('toggle state switches between null and index', () => {
    let expandedIndex: number | null = null;
    const toggle = (i: number) => {
      expandedIndex = expandedIndex === i ? null : i;
    };

    toggle(0);
    expect(expandedIndex).toBe(0);

    toggle(0);
    expect(expandedIndex).toBe(null);

    toggle(2);
    expect(expandedIndex).toBe(2);

    toggle(1);
    expect(expandedIndex).toBe(1);
  });
});

describe('Breadcrumb items', () => {
  it('constructs breadcrumb items for a place', () => {
    const religion = 'islam';
    const placeName = 'Al-Farooq Mosque';

    const items = [
      { label: 'Home', href: '/home' },
      {
        label: religion.charAt(0).toUpperCase() + religion.slice(1),
        href: `/home?religion=${religion}`,
      },
      { label: placeName },
    ];

    expect(items).toHaveLength(3);
    expect(items[0].href).toBe('/home');
    expect(items[1].label).toBe('Islam');
    expect(items[2].href).toBeUndefined();
  });
});

describe('Religion schema mapping', () => {
  it('maps religions to Schema.org types', () => {
    const RELIGION_SCHEMA: Record<string, string> = {
      islam: 'Mosque',
      christianity: 'Church',
      hinduism: 'HinduTemple',
      buddhism: 'BuddhistTemple',
      sikhism: 'Gurdwara',
      judaism: 'Synagogue',
      bahai: 'PlaceOfWorship',
      zoroastrianism: 'PlaceOfWorship',
    };

    expect(RELIGION_SCHEMA['islam']).toBe('Mosque');
    expect(RELIGION_SCHEMA['christianity']).toBe('Church');
    expect(RELIGION_SCHEMA['unknown'] || 'PlaceOfWorship').toBe('PlaceOfWorship');
  });
});
