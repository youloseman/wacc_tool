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
} as const;
