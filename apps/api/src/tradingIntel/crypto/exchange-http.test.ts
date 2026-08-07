import { describe, it, expect, vi } from "vitest";
import { ExchangeHttpClient, ExchangeHttpError } from "./exchange-http.js";

// Polyfill fetch for Node <22 (tests run on Node 22 which has it, but be safe).
// vitest 2.x uses undici internally.

describe("ExchangeHttpClient", () => {
  it("builds GET URLs with query string and JSON response", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true, items: [1, 2, 3] }), { status: 200, headers: { "content-type": "application/json" } }));
    (globalThis as any).fetch = fetchSpy;
    const c = new ExchangeHttpClient({ baseUrl: "https://api.example.com" });
    const r = await c.request<{ ok: boolean; items: number[] }>({
      method: "GET", path: "/v1/ping", query: { a: 1, b: "hello" }, skipAuth: true,
    });
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ ok: true, items: [1, 2, 3] });
    const url = fetchSpy.mock.calls[0][0];
    expect(String(url)).toMatch(/a=1/);
    expect(String(url)).toMatch(/b=hello/);
  });

  it("applies signer headers and path/body mutation on private requests", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    (globalThis as any).fetch = fetchSpy;
    const c = new ExchangeHttpClient({
      baseUrl: "https://api.example.com",
      signer: {
        async sign({ method, path, body, headers }) {
          headers["X-Signed"] = "yes";
          if (method === "POST") {
            return { body: (body ?? "") + "&sig=abc" };
          } else {
            return { path: path + (path.includes("?") ? "&" : "?") + "sig=abc" };
          }
        },
      },
    });
    await c.request({ method: "GET", path: "/v1/account" });
    expect(fetchSpy.mock.calls[0][0]).toMatch(/sig=abc/);
    expect(fetchSpy.mock.calls[0][1].headers["X-Signed"]).toBe("yes");

    await c.request({ method: "POST", path: "/v1/order", body: { qty: 1 } });
    const bodySent = fetchSpy.mock.calls[1][1].body as string;
    expect(bodySent).toContain("sig=abc");
  });

  it("throws ExchangeHttpError on 4xx", async () => {
    (globalThis as any).fetch = vi.fn(async () => new Response(JSON.stringify({ code: -1002, msg: "invalid signature" }), { status: 401 }));
    const c = new ExchangeHttpClient({ baseUrl: "https://api.example.com" });
    await expect(c.request({ method: "GET", path: "/v1/account", skipAuth: true })).rejects.toBeInstanceOf(ExchangeHttpError);
    try {
      await c.request({ method: "GET", path: "/v1/account", skipAuth: true });
    } catch (e) {
      expect((e as ExchangeHttpError).status).toBe(401);
      expect((e as ExchangeHttpError).exchangeCode).toBe(-1002);
      expect((e as ExchangeHttpError).message).toMatch(/invalid signature/);
    }
  });

  it("retries on 429 with Retry-After", async () => {
    let calls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      calls++;
      if (calls < 2) return new Response(JSON.stringify({ msg: "rate limit" }), { status: 429, headers: { "retry-after": "0" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const c = new ExchangeHttpClient({ baseUrl: "https://api.example.com" });
    const r = await c.request({ method: "GET", path: "/v1/x", skipAuth: true });
    expect(r.status).toBe(200);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
