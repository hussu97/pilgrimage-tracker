import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdBanner from '@/components/ads/AdBanner';
import {
  filterSlotsForAdServer,
  resolveAdsenseSlotId,
  type AdSlotConfig,
} from '@/components/ads/ad-constants';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let mockSlotConfig: AdSlotConfig = 'ca-pub-1234567890/9876543210';

vi.mock('@/components/ads/AdProvider', () => ({
  useAds: () => ({
    canShowAds: true,
    adServer: 'adsense',
    getSlotConfig: () => mockSlotConfig,
    getSlotId: () => 'ca-pub-1234567890/9876543210',
    consent: { ads: true, analytics: true },
    setConsent: vi.fn(),
    acceptAll: vi.fn(),
    showConsentBanner: false,
    dismissConsentBanner: vi.fn(),
  }),
}));

vi.mock('@/app/providers', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) => (key === 'ads.label' ? 'Ad' : key),
  }),
}));

let mountedRoots: Array<ReturnType<typeof createRoot>> = [];

function renderComponent(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(ui);
  });

  return { container, root };
}

afterEach(() => {
  for (const root of mountedRoots) {
    act(() => {
      root.unmount();
    });
  }
  mountedRoots = [];
  document.body.innerHTML = '';
  delete (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle;
  mockSlotConfig = 'ca-pub-1234567890/9876543210';
});

describe('AdBanner', () => {
  it('creates the AdSense node outside React ownership', () => {
    const { container } = renderComponent(<AdBanner slot="place-detail-mid" format="rectangle" />);

    const adNode = container.querySelector('.adsbygoogle');
    expect(adNode).not.toBeNull();
    expect(adNode?.getAttribute('data-ad-slot')).toBe('ca-pub-1234567890/9876543210');
    expect((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle).toHaveLength(1);
  });

  it('unmounts cleanly if a third-party script already removed the ad node', () => {
    const { container, root } = renderComponent(
      <AdBanner slot="place-detail-mid" format="rectangle" />,
    );

    container.querySelector('.adsbygoogle')?.remove();

    expect(() => {
      act(() => {
        root.unmount();
      });
    }).not.toThrow();
    mountedRoots = mountedRoots.filter((mountedRoot) => mountedRoot !== root);
  });

  it('renders an Adsterra banner tag from slot config', () => {
    mockSlotConfig = {
      provider: 'adsterra',
      type: 'banner',
      key: 'adsterra-zone-key',
      width: 320,
      height: 50,
    };

    const { container } = renderComponent(<AdBanner slot="home-feed" format="horizontal" />);

    const scripts = container.querySelectorAll('script');
    expect(scripts).toHaveLength(2);
    expect(scripts[0].textContent).toContain('adsterra-zone-key');
    expect(scripts[1].getAttribute('src')).toBe(
      'https://www.highperformanceformat.com/adsterra-zone-key/invoke.js',
    );
  });

  it('filters slot configs to the configured ad server', () => {
    const slots = {
      'home-feed': {
        provider: 'adsterra',
        type: 'banner',
        key: 'adsterra-zone-key',
      },
      'place-detail-mid': 'ca-pub-123/456',
      'place-detail-bottom': {
        provider: 'adsense',
        slotId: 'ca-pub-123/789',
      },
    } as const;

    expect(filterSlotsForAdServer(slots, 'adsterra')).toEqual({
      'home-feed': {
        provider: 'adsterra',
        type: 'banner',
        key: 'adsterra-zone-key',
      },
    });
    expect(filterSlotsForAdServer(slots, 'adsense')).toEqual({
      'place-detail-mid': 'ca-pub-123/456',
      'place-detail-bottom': {
        provider: 'adsense',
        slotId: 'ca-pub-123/789',
      },
    });
    expect(resolveAdsenseSlotId(filterSlotsForAdServer(slots, 'adsterra')['home-feed'])).toBe('');
  });
});
