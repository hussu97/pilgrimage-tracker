import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** Keys that should be persisted to AsyncStorage for instant startup. */
const PERSIST_KEYS = new Set([
  'languages',
  'translations:en',
  'translations:ar',
  'translations:hi',
  'translations:te',
  'translations:ml',
]);

const AS_PREFIX = 'cache:';

/** Hydrate in-memory cache from AsyncStorage on app start. Call once at boot. */
export async function hydrateCache(): Promise<void> {
  try {
    const keys = Array.from(PERSIST_KEYS).map((k) => AS_PREFIX + k);
    const pairs = await AsyncStorage.multiGet(keys);
    for (const [fullKey, raw] of pairs) {
      if (!raw) continue;
      try {
        const key = fullKey.replace(AS_PREFIX, '');
        const entry: CacheEntry<unknown> = JSON.parse(raw);
        cache.set(key, entry);
      } catch {
        // corrupted entry — skip
      }
    }
  } catch {
    // AsyncStorage unavailable — in-memory only
  }
}

export function getCached<T>(key: string, ttlMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  cache.set(key, entry as CacheEntry<unknown>);
  // Persist critical keys to AsyncStorage for instant startup
  if (PERSIST_KEYS.has(key)) {
    AsyncStorage.setItem(AS_PREFIX + key, JSON.stringify(entry)).catch(() => {});
  }
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    for (const key of PERSIST_KEYS) {
      AsyncStorage.removeItem(AS_PREFIX + key).catch(() => {});
    }
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      if (PERSIST_KEYS.has(key)) {
        AsyncStorage.removeItem(AS_PREFIX + key).catch(() => {});
      }
    }
  }
}
