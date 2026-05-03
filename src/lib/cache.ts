import { AnalysisResult, DiscoveryResponse } from "./types";

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

const ttl24Hours = 24 * 60 * 60 * 1000;

export const asinAnalysisCache = new TTLCache<AnalysisResult>(ttl24Hours);
export const discoveryCache = new TTLCache<DiscoveryResponse>(ttl24Hours);
