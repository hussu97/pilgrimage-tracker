import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupLegacyServiceWorkers } from '../lib/serviceWorkerCleanup';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('cleanupLegacyServiceWorkers', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    // @ts-expect-error test-only global cleanup
    delete globalThis.caches;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });
  });

  it('unregisters existing service workers and deletes cache storage entries', async () => {
    const unregisterA = vi.fn().mockResolvedValue(true);
    const unregisterB = vi.fn().mockResolvedValue(true);
    const cacheDelete = vi.fn().mockResolvedValue(true);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi
          .fn()
          .mockResolvedValue([{ unregister: unregisterA }, { unregister: unregisterB }]),
      },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['old-vite-cache', 'precache-v1']),
        delete: cacheDelete,
      },
    });

    cleanupLegacyServiceWorkers();
    await flushPromises();

    expect(unregisterA).toHaveBeenCalledOnce();
    expect(unregisterB).toHaveBeenCalledOnce();
    expect(cacheDelete).toHaveBeenCalledWith('old-vite-cache');
    expect(cacheDelete).toHaveBeenCalledWith('precache-v1');
  });

  it('runs only once per browser session', async () => {
    const getRegistrations = vi.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations },
    });

    cleanupLegacyServiceWorkers();
    cleanupLegacyServiceWorkers();
    await flushPromises();

    expect(getRegistrations).toHaveBeenCalledOnce();
  });
});
