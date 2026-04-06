interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePattern(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  stats(): { size: number; maxSize: number } {
    // Purge expired before reporting
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
    return { size: this.store.size, maxSize: this.maxSize };
  }
}

// Singleton cache instance
export const cache = new MemoryCache(500);

// Pre-defined TTLs
export const TTL = {
  SHORT: 30 * 1000,       // 30 seconds (for rapidly changing data)
  MEDIUM: 5 * 60 * 1000,  // 5 minutes (for products, alerts lists)
  LONG: 30 * 60 * 1000,   // 30 minutes (for settings, analytics)
  HOUR: 60 * 60 * 1000,   // 1 hour
} as const;

/**
 * Cache-aside helper: get from cache, or compute and store.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  compute: () => T | Promise<T>
): Promise<T> {
  const hit = cache.get<T>(key);
  if (hit !== null) return hit;

  const result = await compute();
  cache.set(key, result, ttlMs);
  return result;
}
