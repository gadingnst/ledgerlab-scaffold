import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { rateLimit, parseWindowSeconds } from "../index";

describe("rateLimit", () => {
  it("parses window durations accurately", () => {
    expect(parseWindowSeconds(30)).toBe(30);
    expect(parseWindowSeconds("45s")).toBe(45);
    expect(parseWindowSeconds("1m")).toBe(60);
    expect(parseWindowSeconds("15m")).toBe(900);
    expect(parseWindowSeconds("1h")).toBe(3600);
  });

  it("permits requests within the limit and adds standard headers", async () => {
    const app = new Hono();
    app.use("/api/*", rateLimit({ window: "1m", limit: 2, by: "ip", keyPrefix: "test-allow" }));
    app.get("/api/ping", (c) => c.text("pong"));

    const res1 = await app.request("/api/ping", { headers: { "cf-connecting-ip": "1.1.1.1" } });
    expect(res1.status).toBe(200);
    expect(res1.headers.get("RateLimit-Limit")).toBe("2");
    expect(res1.headers.get("RateLimit-Remaining")).toBe("1");

    const res2 = await app.request("/api/ping", { headers: { "cf-connecting-ip": "1.1.1.1" } });
    expect(res2.status).toBe(200);
    expect(res2.headers.get("RateLimit-Remaining")).toBe("0");
  });

  it("blocks requests exceeding limit with HTTP 429 and Retry-After", async () => {
    const app = new Hono();
    app.use("/api/*", rateLimit({ window: "1m", limit: 2, by: "ip", keyPrefix: "test-block" }));
    app.get("/api/ping", (c) => c.text("pong"));

    await app.request("/api/ping", { headers: { "cf-connecting-ip": "2.2.2.2" } });
    await app.request("/api/ping", { headers: { "cf-connecting-ip": "2.2.2.2" } });

    // Third request exceeds limit of 2
    const res3 = await app.request("/api/ping", { headers: { "cf-connecting-ip": "2.2.2.2" } });
    expect(res3.status).toBe(429);
    expect(res3.headers.get("Retry-After")).toBeDefined();

    const body = (await res3.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");

    // Other IP is unaffected
    const resOther = await app.request("/api/ping", { headers: { "cf-connecting-ip": "3.3.3.3" } });
    expect(resOther.status).toBe(200);
  });
});
