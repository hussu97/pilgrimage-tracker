interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** Keys that should be persisted to localStorage for instant startup. */
const PERSIST_KEYS = new Set([
  'languages',
  'translations:en',
  'translations:ar',
  'translations:hi',
  'translations:te',
  'translations:ml',
]);

const LS_PREFIX = 'cache:';

/** Try to restore a persisted entry from localStorage. */
function restoreFromStorage<T>(key: string, ttlMs: number): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > ttlMs) {
      localStorage.removeItem(LS_PREFIX + key);
      return null;
    }
    // Populate in-memory cache so future reads are fast
    cache.set(key, entry as CacheEntry<unknown>);
    return entry.data;
  } catch {
    return null;
  }
}

export function getCached<T>(key: string, ttlMs: number): T | null {
  const entry = cache.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp > ttlMs) {
      cache.delete(key);
      // Fall through to check localStorage
    } else {
      return entry.data as T;
    }
  }
  // Check persistent storage for keys we persist
  if (PERSIST_KEYS.has(key)) {
    return restoreFromStorage<T>(key, ttlMs);
  }
  return null;
}

export function setCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  cache.set(key, entry as CacheEntry<unknown>);
  // Persist critical keys to localStorage for instant startup
  if (PERSIST_KEYS.has(key)) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Storage full or unavailable — in-memory cache still works
    }
  }
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    for (const key of PERSIST_KEYS) {
      try {
        localStorage.removeItem(LS_PREFIX + key);
      } catch {
        // ignore
      }
    }
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      if (PERSIST_KEYS.has(key)) {
        try {
          localStorage.removeItem(LS_PREFIX + key);
        } catch {
          // ignore
        }
      }
    }
  }
}
