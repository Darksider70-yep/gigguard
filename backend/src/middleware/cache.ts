import { NextFunction, Request, Response } from 'express';

interface CacheEntry {
  data: any;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry>();

  set(key: string, data: any, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  get(key: string): any | null {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }
}

export const cache = new MemoryCache();

export function withCache(key: string, ttlMs: number) {
  return (_req: Request, res: Response, next: NextFunction): Response | void => {
    const cached = cache.get(key);
    if (cached) {
      return res.json(cached);
    }

    const originalJson = res.json.bind(res);
    res.json = ((data: any) => {
      cache.set(key, data, ttlMs);
      return originalJson(data);
    }) as typeof res.json;
    next();
  };
}
