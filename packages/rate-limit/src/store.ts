import Redis from "ioredis";

export interface RateLimitResult {
  current: number;
  ttlSeconds: number;
}

export interface RateLimitStore {
  increment(key: string, windowSeconds: number): Promise<RateLimitResult>;
}

// In-memory store fallback when Redis is absent or unreachable
class InMemoryStore implements RateLimitStore {
  private hits = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || entry.expiresAt <= now) {
      const expiresAt = now + windowSeconds * 1000;
      this.hits.set(key, { count: 1, expiresAt });
      return { current: 1, ttlSeconds: windowSeconds };
    }

    entry.count += 1;
    const ttlSeconds = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    return { current: entry.count, ttlSeconds };
  }
}

class RedisStore implements RateLimitStore {
  private client: Redis;
  private fallback = new InMemoryStore();
  private isConnected = false;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) return null; // stop reconnecting if down
        return Math.min(times * 200, 1000);
      },
    });

    this.client.on("connect", () => {
      this.isConnected = true;
    });

    this.client.on("error", (err) => {
      this.isConnected = false;
    });

    // Attempt non-blocking initial connection
    this.client.connect().catch(() => {
      this.isConnected = false;
    });
  }

  async increment(key: string, windowSeconds: number): Promise<RateLimitResult> {
    if (!this.isConnected && this.client.status !== "ready") {
      return this.fallback.increment(key, windowSeconds);
    }

    try {
      // Atomic INCR + EXPIRE via Lua
      const lua = `
        local current = redis.call(INCR, KEYS[1])
        if current == 1 then
          redis.call(EXPIRE, KEYS[1], ARGV[1])
        end
        local ttl = redis.call(TTL, KEYS[1])
        return {current, ttl}
      `;
      const result = (await this.client.eval(lua, 1, key, windowSeconds)) as [number, number];
      const current = Number(result[0]);
      const ttl = Number(result[1]);
      return {
        current,
        ttlSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    } catch {
      return this.fallback.increment(key, windowSeconds);
    }
  }
}

const stores = new Map<string, RateLimitStore>();

export function getStore(redisUrl?: string): RateLimitStore {
  const url = redisUrl || process.env.REDIS_URL;
  if (!url) {
    let memoryStore = stores.get("memory");
    if (!memoryStore) {
      memoryStore = new InMemoryStore();
      stores.set("memory", memoryStore);
    }
    return memoryStore;
  }

  let store = stores.get(url);
  if (!store) {
    store = new RedisStore(url);
    stores.set(url, store);
  }
  return store;
}
