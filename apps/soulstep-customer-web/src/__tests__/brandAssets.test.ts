import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from '../../app/manifest';

const appRoot = process.cwd();
const publicPath = (path: string) => join(appRoot, 'public', path);

describe('brand favicon assets', () => {
  it('uses the SoulStep mark instead of the old timer icon', () => {
    const favicon = readFileSync(publicPath('favicon.svg'), 'utf8');

    expect(favicon).toContain('SoulStep logo');
    expect(favicon).toContain('#AB553E');
    expect(favicon).toContain('#364844');
    expect(favicon).not.toContain('M12 8v4l2 2');
  });

  it('publishes favicon, apple-touch, and manifest icons', () => {
    expect(existsSync(publicPath('favicon.ico'))).toBe(true);
    expect(existsSync(publicPath('favicon-512x512.png'))).toBe(true);
    expect(existsSync(publicPath('icon-192x192.png'))).toBe(true);
    expect(existsSync(publicPath('apple-touch-icon.png'))).toBe(true);

    expect(manifest().icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/icon-192x192.png', sizes: '192x192' }),
        expect.objectContaining({ src: '/favicon-512x512.png', sizes: '512x512' }),
      ]),
    );
  });
});
