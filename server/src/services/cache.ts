interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class DataCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    const expiresAt = ttlSeconds === 0 ? 0 : Date.now() + ttlSeconds * 1000;
    this.store.set(key, { data, expiresAt });
  }

  clear(): void {
    this.store.clear();
  }
}

export const cache = new DataCache();

export const TTL = {
  DAY: 86_400,
  WEEK: 604_800,
  // Financial statements update quarterly at most; historical market index prices don't
  // change retroactively — safe to cache for 30 days.
  MONTH: 2_592_000,
} as const;
