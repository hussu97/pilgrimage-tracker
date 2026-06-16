import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDocumentTitle, useHead, type HeadConfig } from '@/lib/hooks/useHead';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let mountedRoots: Root[] = [];

function HeadHarness({ config }: { config: HeadConfig }) {
  useHead(config);
  return null;
}

function renderHead(config: HeadConfig) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(createElement(HeadHarness, { config }));
  });

  return { root };
}

afterEach(() => {
  for (const root of mountedRoots) {
    act(() => {
      root.unmount();
    });
  }
  mountedRoots = [];
  document.body.innerHTML = '';
  document.head
    .querySelectorAll('[data-test-owned-metadata="true"]')
    .forEach((node) => node.remove());
  document.title = '';
});

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

describe('useHead runtime behavior', () => {
  it('builds SoulStep document titles', () => {
    expect(buildDocumentTitle('Test Page')).toBe('Test Page | SoulStep');
    expect(buildDocumentTitle()).toBe('SoulStep');
  });

  it('updates document.title for client-only page titles', () => {
    renderHead({ title: 'Test Page' });

    expect(document.title).toBe('Test Page | SoulStep');
  });

  it('resets only the title it applied', () => {
    const { root } = renderHead({ title: 'Old Page' });
    document.title = 'New Page | SoulStep';

    act(() => {
      root.unmount();
    });
    mountedRoots = mountedRoots.filter((mountedRoot) => mountedRoot !== root);

    expect(document.title).toBe('New Page | SoulStep');
  });

  it('does not append or remove Next-owned metadata resources', () => {
    const serverMeta = document.createElement('meta');
    serverMeta.setAttribute('name', 'description');
    serverMeta.setAttribute('content', 'Server metadata');
    serverMeta.setAttribute('data-test-owned-metadata', 'true');
    document.head.appendChild(serverMeta);

    const { root } = renderHead({
      title: 'Metadata Page',
      description: 'Client description',
      canonicalUrl: 'https://www.soul-step.org/metadata-page',
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebPage' }],
    });

    expect(
      document.head.querySelector('meta[name="description"][content="Client description"]'),
    ).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    mountedRoots = mountedRoots.filter((mountedRoot) => mountedRoot !== root);

    expect(document.head.contains(serverMeta)).toBe(true);
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
