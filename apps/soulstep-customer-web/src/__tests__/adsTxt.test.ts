import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = process.cwd();
const adsTxt = readFileSync(join(appRoot, 'public/ads.txt'), 'utf8').trim();
const vercelConfig = JSON.parse(readFileSync(join(appRoot, 'vercel.json'), 'utf8')) as {
  headers: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
};

describe('ads.txt deployment config', () => {
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
});
