import type { Context, MiddlewareHandler } from "hono";
import { getStore } from "./store";

export type RateLimitBy = "ip" | "user";

export interface RateLimitOptions {
  window: string | number;
  limit: number;
  by?: RateLimitBy;
  keyPrefix?: string;
  redisUrl?: string;
  message?: string;
  skip?: (c: Context) => boolean;
}

export function parseWindowSeconds(window: string | number): number {
  if (typeof window === "number") return Math.max(1, Math.floor(window));
  const match = window.trim().match(/^(\d+)\s*(s|m|h|d)?$/i);
  if (!match || !match[1]) return 60;
  const val = parseInt(match[1], 10);
  const unit = (match[2] || "s").toLowerCase();
  switch (unit) {
    case "s":
      return Math.max(1, val);
    case "m":
      return Math.max(1, val * 60);
    case "h":
      return Math.max(1, val * 3600);
    case "d":
      return Math.max(1, val * 86400);
    default:
      return Math.max(1, val);
  }
}

export function extractClientIp(c: Context): string {
  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const xForwardedFor = c.req.header("x-forwarded-for");
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const xRealIp = c.req.header("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  return "127.0.0.1";
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const windowSeconds = parseWindowSeconds(options.window);
  const limit = options.limit;
  const by = options.by ?? "ip";
  const prefix = options.keyPrefix ?? "rl";
  const store = getStore(options.redisUrl);

  return async function rateLimitMiddleware(c, next) {
    if (options.skip?.(c)) {
      return next();
    }

    let identifier = "anonymous";
    if (by === "ip") {
      identifier = extractClientIp(c);
    } else if (by === "user") {
      // Future user-based rate limiting
      identifier = c.req.header("x-user-id") || extractClientIp(c);
    }

    const key = `${prefix}:${by}:${identifier}`;
    const { current, ttlSeconds } = await store.increment(key, windowSeconds);

    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(Math.max(0, limit - current)));
    c.header("RateLimit-Reset", String(ttlSeconds));

    if (current > limit) {
      c.header("Retry-After", String(ttlSeconds));
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message:
              options.message ??
              `Too many requests. Please try again in ${ttlSeconds} second${ttlSeconds > 1 ? "s" : ""}.`,
          },
        },
        429,
      );
    }

    return next();
  };
}

export * from "./store";
