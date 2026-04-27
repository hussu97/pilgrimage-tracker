import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = process.cwd();
const publicFile = (path: string) => readFileSync(join(appRoot, 'public', path), 'utf8').trim();
const adsTxt = publicFile('ads.txt');
const vercelConfig = JSON.parse(readFileSync(join(appRoot, 'vercel.json'), 'utf8')) as {
  headers: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
};

const cacheHeader = {
  key: 'Cache-Control',
  value: 'public, max-age=3600, stale-while-revalidate=86400',
};

describe('crawler file deployment config', () => {
  it('publishes the Google seller entry as a static root file', () => {
    expect(adsTxt).toBe('google.com, pub-7902951158656200, DIRECT, f08c47fec0942fa0');
  });

  it('overrides the app-shell no-store header for ad crawlers', () => {
    const adsHeaderRule = vercelConfig.headers.find((rule) => rule.source === '/ads.txt');

    expect(adsHeaderRule).toBeDefined();
    expect(adsHeaderRule?.headers).toEqual(
      expect.arrayContaining([
        { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
        { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
      ]),
    );
  });

  it('serves other crawler-facing static files with cacheable headers', () => {
    expect(publicFile('robots.txt')).toContain('Sitemap: https://www.soul-step.org/sitemap.xml');
    expect(publicFile('llms.txt')).toContain('SoulStep');
    expect(JSON.parse(publicFile('.well-known/ai-plugin.json')).schema_version).toBe('v1');

    expect(vercelConfig.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/robots.txt',
          headers: expect.arrayContaining([
            { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
            cacheHeader,
          ]),
        }),
        expect.objectContaining({
          source: '/llms.txt',
          headers: expect.arrayContaining([
            { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
            cacheHeader,
          ]),
        }),
        expect.objectContaining({
          source: '/.well-known/(.*)',
          headers: expect.arrayContaining([cacheHeader]),
        }),
      ]),
    );
  });
});
