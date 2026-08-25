// @vitest-environment happy-dom
/**
 * Session 202 — core API client tests.
 *
 * `api.ts` is the single choke point every request in the web app flows
 * through, so its behaviour is the highest-leverage thing to lock down:
 *   - query-param serialization (skipping null/undefined)
 *   - JSON body encoding vs. FormData pass-through
 *   - Authorization header injection / skipAuth / forced token
 *   - success unwrapping ({ ok, data, meta }) and ApiError mapping
 *   - 401 -> refresh -> retry-once, refresh de-duplication, and dead-session
 *     clearing
 *
 * The real zustand auth store is used (happy-dom provides localStorage);
 * only `fetch` is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, apiRaw, ApiError } from "./api";
import { useAuthStore } from "@/store/auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  useAuthStore.getState().clear();
  // Keep us on an /auth path so a dead-session redirect is a no-op.
  window.history.pushState({}, "", "/auth/login");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request construction", () => {
  it("prefixes /api/v1 and unwraps the data envelope", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: { hello: "world" } }));
    const out = await api<{ hello: string }>("/thing");
    expect(out).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/thing");
  });

  it("serializes params and skips null/undefined values", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: [] }));
    await api.get("/list", { page: 2, q: "hi", empty: undefined, none: null });
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/list?");
    expect(url).toContain("page=2");
    expect(url).toContain("q=hi");
    expect(url).not.toContain("empty");
    expect(url).not.toContain("none");
  });

  it("stringifies the json body and sets a JSON content-type", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: { id: "1" } }));
    await api.post("/create", { name: "Ada" });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Ada" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("passes FormData through untouched and omits the JSON content-type", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: null }));
    const fd = new FormData();
    fd.append("file", "x");
    await api("/upload", { method: "POST", body: fd });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(fd);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("returns meta alongside data from apiRaw", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: [1], meta: { total: 1 } }));
    const res = await apiRaw<number[]>("/nums");
    expect(res.data).toEqual([1]);
    expect(res.meta).toEqual({ total: 1 });
  });
});

describe("authorization header", () => {
  it("injects a Bearer token when authenticated", async () => {
    useAuthStore.getState().setAuth("tok-123", "refresh-1", { id: "u1", email: "a@b.c", role: "user" }, 900);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: {} }));
    await api.get("/me");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("omits Authorization when skipAuth is set", async () => {
    useAuthStore.getState().setAuth("tok-123", "refresh-1", { id: "u1", email: "a@b.c", role: "user" }, 900);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: {} }));
    await api("/public", { skipAuth: true });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("uses a forced token over the stored one", async () => {
    useAuthStore.getState().setAuth("stored", "refresh-1", { id: "u1", email: "a@b.c", role: "user" }, 900);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: {} }));
    await api("/x", { token: "forced-tok" });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer forced-tok");
  });
});

describe("error mapping", () => {
  it("throws ApiError with the server error code/message/status on !ok HTTP", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: { code: "BAD_INPUT", message: "nope", details: { field: "x" } } }, 422)
    );
    await expect(api("/thing")).rejects.toMatchObject({
      name: "ApiError",
      code: "BAD_INPUT",
      message: "nope",
      status: 422,
      details: { field: "x" },
    });
  });

  it("treats { ok: false } as an error even on HTTP 200", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: "LOGIC", message: "bad" } }, 200));
    await expect(api("/thing")).rejects.toBeInstanceOf(ApiError);
  });

  it("falls back to INTERNAL_ERROR when the body has no error shape", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500, statusText: "Server Error" }));
    await expect(api("/thing")).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
  });
});

describe("401 refresh + retry", () => {
  it("refreshes on 401, retries once with the new token, and succeeds", async () => {
    useAuthStore.getState().setAuth("old-tok", "refresh-1", { id: "u1", email: "a@b.c", role: "user" }, 900);
    fetchMock
      // 1) original request -> 401
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: "UNAUTHORIZED", message: "x" } }, 401))
      // 2) refresh call -> new tokens
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { token: "new-tok", refreshToken: "refresh-2", expiresIn: 900 } }))
      // 3) retried original request -> success
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { done: true } }));

    const out = await api<{ done: boolean }>("/secure");
    expect(out).toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // refresh endpoint was hit
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/v1/auth/refresh");
    // retried request carries the refreshed token
    const retryInit = fetchMock.mock.calls[2]![1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe("Bearer new-tok");
    expect(useAuthStore.getState().accessToken).toBe("new-tok");
  });

  it("clears the session and throws the original 401 when refresh fails", async () => {
    useAuthStore.getState().setAuth("old-tok", "refresh-1", { id: "u1", email: "a@b.c", role: "user" }, 900);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: "UNAUTHORIZED", message: "x" } }, 401))
      // refresh -> failure
      .mockResolvedValueOnce(new Response("", { status: 401 }));

    await expect(api("/secure")).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it("de-duplicates concurrent refreshes into a single refresh call", async () => {
    useAuthStore.getState().setAuth("old-tok", "refresh-1", { id: "u1", email: "a@b.c", role: "user" }, 900);
    let refreshCalls = 0;
    // Each original request 401s the first time it is seen (with the old token),
    // then succeeds once re-issued with the refreshed token. Both in-flight
    // requests should therefore share a single refresh call.
    const seen = new Set<string>();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/v1/auth/refresh") {
        refreshCalls++;
        return Promise.resolve(
          jsonResponse({ ok: true, data: { token: "new-tok", refreshToken: "refresh-2", expiresIn: 900 } })
        );
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth === "Bearer old-tok" && !seen.has(url)) {
        seen.add(url);
        return Promise.resolve(jsonResponse({ ok: false, error: { code: "UNAUTHORIZED", message: "x" } }, 401));
      }
      return Promise.resolve(jsonResponse({ ok: true, data: { url } }));
    });

    const [a, b] = await Promise.all([api("/a"), api("/b")]);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(refreshCalls).toBe(1);
  });
});

describe("proactive refresh before send", () => {
  it("refreshes ahead of time when the stored token is already expired", async () => {
    // expiresIn negative -> isTokenExpired() true immediately
    useAuthStore.getState().setAuth("stale-tok", "refresh-1", { id: "u1", email: "a@b.c", role: "user" }, -100);
    fetchMock
      // refresh first (proactive)
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { token: "fresh-tok", refreshToken: "refresh-2", expiresIn: 900 } }))
      // then the actual request
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { done: true } }));

    const out = await api<{ done: boolean }>("/secure");
    expect(out).toEqual({ done: true });
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/auth/refresh");
    const reqInit = fetchMock.mock.calls[1]![1] as RequestInit;
    expect((reqInit.headers as Record<string, string>).Authorization).toBe("Bearer fresh-tok");
  });
});
