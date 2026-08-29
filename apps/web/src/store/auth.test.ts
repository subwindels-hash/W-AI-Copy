// @vitest-environment happy-dom
/**
 * Session 202 — auth store tests.
 *
 * The zustand auth store is the source of truth for session state used by the
 * API client and every guarded route. Its non-trivial behaviour:
 *   - setAuth / updateToken / clear keep localStorage and in-memory state in sync
 *   - updateToken rotates tokens without dropping the user object
 *   - isTokenExpired() applies a 30s pre-expiry skew buffer and treats a missing
 *     expiry as expired
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useAuthStore } from "./auth";

const user = { id: "u1", email: "a@b.c", role: "user" as const, displayName: "Ada" };

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("setAuth", () => {
  it("stores tokens + user in state and localStorage", () => {
    useAuthStore.getState().setAuth("tok", "ref", user, 900);
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe("tok");
    expect(s.refreshToken).toBe("ref");
    expect(s.user).toEqual(user);
    expect(localStorage.getItem("windels:accessToken")).toBe("tok");
    expect(localStorage.getItem("windels:refreshToken")).toBe("ref");
    expect(JSON.parse(localStorage.getItem("windels:user")!)).toEqual(user);
    expect(s.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe("updateToken", () => {
  it("rotates tokens and expiry while preserving the user", () => {
    useAuthStore.getState().setAuth("tok", "ref", user, 900);
    useAuthStore.getState().updateToken("tok2", "ref2", 900);
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe("tok2");
    expect(s.refreshToken).toBe("ref2");
    expect(s.user).toEqual(user); // untouched
    expect(localStorage.getItem("windels:accessToken")).toBe("tok2");
  });
});

describe("clear", () => {
  it("wipes state and all persisted keys", () => {
    useAuthStore.getState().setAuth("tok", "ref", user, 900);
    useAuthStore.getState().clear();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.expiresAt).toBeNull();
    expect(localStorage.getItem("windels:accessToken")).toBeNull();
    expect(localStorage.getItem("windels:user")).toBeNull();
  });
});

describe("setDevice", () => {
  it("persists the device id", () => {
    useAuthStore.getState().setDevice("dev-9");
    expect(useAuthStore.getState().deviceId).toBe("dev-9");
    expect(localStorage.getItem("windels:deviceId")).toBe("dev-9");
  });
});

describe("isTokenExpired", () => {
  it("returns true when there is no expiry set", () => {
    expect(useAuthStore.getState().isTokenExpired()).toBe(true);
  });

  it("returns false for a token comfortably in the future", () => {
    useAuthStore.getState().setAuth("tok", "ref", user, 900);
    expect(useAuthStore.getState().isTokenExpired()).toBe(false);
  });

  it("returns true within the 30s pre-expiry skew buffer", () => {
    // Expires in 20s -> inside the 30s buffer -> considered expired.
    useAuthStore.getState().setAuth("tok", "ref", user, 20);
    expect(useAuthStore.getState().isTokenExpired()).toBe(true);
  });

  it("flips to expired as wall-clock advances past the buffer", () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);
    useAuthStore.getState().setAuth("tok", "ref", user, 900); // ~15min
    expect(useAuthStore.getState().isTokenExpired()).toBe(false);
    // Advance to 30s before expiry -> now expired.
    vi.setSystemTime(start + (900 - 29) * 1000);
    expect(useAuthStore.getState().isTokenExpired()).toBe(true);
  });
});
