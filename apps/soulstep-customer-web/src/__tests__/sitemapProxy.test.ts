import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('sitemap proxy route handlers', () => {
  it('proxies the sitemap index without ISR fetch caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<sitemapindex />', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const route = await import('../../app/api/sitemap/route');
    const resp = await route.GET();

    expect(fetchMock).toHaveBeenCalledWith('https://catalog-api.soul-step.org/sitemap.xml', {
      cache: 'no-store',
    });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/xml');
    await expect(resp.text()).resolves.toContain('sitemapindex');
  });

  it('proxies chunked sitemap files without ISR fetch caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<urlset />', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const route = await import('../../app/api/sitemaps/[...path]/route');
    const resp = await route.GET(new Request('https://soul-step.org/sitemaps/places-1.xml'), {
      params: Promise.resolve({ path: ['places-1.xml'] }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://catalog-api.soul-step.org/sitemaps/places-1.xml',
      { cache: 'no-store' },
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/xml');
    await expect(resp.text()).resolves.toContain('urlset');
  });
});
