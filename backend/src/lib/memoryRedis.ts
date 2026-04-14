import { logger } from './logger';

/**
 * Lightweight in-memory replacement for IORedis.
 * Used for Zero-Infrastructure deployments (Render Free Tier).
 */
export class MemoryRedis {
  private store = new Map<string, { value: string; expiresAt: number | null }>();
  public status = 'ready';

  async get(key: string): Promise<string | null> {
    const record = this.store.get(key);
    if (!record) return null;

    if (record.expiresAt && record.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }

    return record.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    let expiresAt: number | null = null;
    if (mode === 'EX' && duration) {
      expiresAt = Date.now() + duration * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const val = await this.get(key);
    const newVal = (Number(val) || 0) + 1;
    await this.set(key, String(newVal));
    return newVal;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const record = this.store.get(key);
    if (!record) return 0;
    record.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async connect(): Promise<void> {
    this.status = 'ready';
    return Promise.resolve();
  }

  on(event: string, callback: (...args: any[]) => void) {
    logger.info('MemoryRedis', `event_registered: ${event}`);
  }
}

export const memoryRedis = new MemoryRedis();
