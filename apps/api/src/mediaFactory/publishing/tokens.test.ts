/**
 * Token lifecycle — freshness check, refresh-on-expiry, revoke-on-failure.
 * Global fetch is stubbed so the OAuth token endpoint is exercised offline.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { saveToken, getToken, ensureFreshToken, connectionStatus, deleteToken } from "./tokens.js";
import { FakeKv } from "./fakeKv.js";

const UID = "u-tok";
const PLATFORM = "youtube";

function jsonRes(status: number, body: unknown) {
  return {
    status,
    headers: { get: (k: string) => (k === "content-type" ? "application/json" : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("ensureFreshToken", () => {
  it("returns the stored access token when not expiring", async () => {
    const kv = new FakeKv();
    await saveToken(UID, PLATFORM, { accessToken: "tok-a" }, null, kv as any);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(ensureFreshToken(UID, PLATFORM, kv as any)).resolves.toBe("tok-a");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token via the platform token endpoint", async () => {
    const kv = new FakeKv();
    await saveToken(UID, PLATFORM, { accessToken: "old-tok", refreshToken: "rtok", expiresInSec: 30 }, null, kv as any);
    const fetchSpy = vi.fn(async (url: string, init: any) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      expect(String(init.body)).toContain("grant_type=refresh_token");
      expect(String(init.body)).toContain("refresh_token=rtok");
      return jsonRes(200, { access_token: "new-tok", refresh_token: "rtok-2", expires_in: 3600 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(ensureFreshToken(UID, PLATFORM, kv as any)).resolves.toBe("new-tok");
    const stored = await getToken(UID, PLATFORM, kv as any);
    expect(stored?.accessToken).toBe("new-tok");
    expect(stored?.refreshToken).toBe("rtok-2");
  });

  it("marks the connection revoked when refresh fails", async () => {
    const kv = new FakeKv();
    await saveToken(UID, PLATFORM, { accessToken: "old-tok", refreshToken: "dead", expiresInSec: 30 }, null, kv as any);
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(400, { error: "invalid_grant" })));

    await expect(ensureFreshToken(UID, PLATFORM, kv as any)).rejects.toThrow(/refresh failed/i);
    const st = await connectionStatus(UID, PLATFORM, kv as any);
    expect(st.connected).toBe(false);
    expect(st.needsReauth).toBe(true);
    // And a subsequent attempt refuses without hitting the network again.
    await expect(ensureFreshToken(UID, PLATFORM, kv as any)).rejects.toThrow(/revoked|Reconnect/i);
  });

  it("fails permanently when no account is connected", async () => {
    const kv = new FakeKv();
    await expect(ensureFreshToken(UID, PLATFORM, kv as any)).rejects.toThrow(/not connected|Complete OAuth/i);
  });

  it("deleteToken disconnects the account", async () => {
    const kv = new FakeKv();
    await saveToken(UID, PLATFORM, { accessToken: "tok-x" }, null, kv as any);
    await deleteToken(UID, PLATFORM, kv as any);
    expect((await connectionStatus(UID, PLATFORM, kv as any)).connected).toBe(false);
  });
});
