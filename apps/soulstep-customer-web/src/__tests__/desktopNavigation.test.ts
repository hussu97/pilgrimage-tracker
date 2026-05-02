import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_RELEASE } from '@/lib/appRelease';

const appRoot = process.cwd();

describe('desktop navigation hardening', () => {
  it('uses native anchors for desktop header navigation', () => {
    const layoutSource = readFileSync(join(appRoot, 'src/components/layout/Layout.tsx'), 'utf8');
    const desktopHeaderSource = layoutSource.slice(
      layoutSource.indexOf('<header'),
      layoutSource.indexOf('</header>'),
    );

    expect(desktopHeaderSource).toContain('href="/home"');
    expect(desktopHeaderSource).toContain('href={item.href}');
    expect(desktopHeaderSource).not.toContain('to={item.href}');
  });

  it('bumps the app shell release marker for returning browsers', () => {
    expect(APP_RELEASE).toBe('desktop-nav-refresh-2026-05-02');
  });
});
