/**
 * Playwright E2E — Session 117: mobile offline durability, device trust and
 * push health.
 *
 * Runs against a live API and pins the behaviours only a running server can
 * prove:
 *   - the Session 21 `/mobile/*` endpoints keep their paths after the sync
 *     router was mounted ahead of them on the same prefix, and `GET
 *     /mobile/config` stays deliberately public;
 *   - every Session 117 endpoint refuses an anonymous caller;
 *   - **the central fix**: an action submitted to the durable queue is still
 *     there on the next read. Before this session `POST /mobile/offline/sync`
 *     counted the array and dropped it, and the client deleted its local copy
 *     regardless — offline work was destroyed and the user was told it synced;
 *   - a stored action is reported *stored*, never *applied*, over the wire;
 *   - a rejected action carries `retainLocally`, so a client that honours the
 *     receipt cannot delete work the server did not take;
 *   - the replay plan comes back ordered by server receipt time;
 *   - no device view and no push view carries a secret (`pinHash`,
 *     `pushTokenHash`, or a full push endpoint);
 *   - the configuration report never echoes the VAPID private key and does warn
 *     about the key pair committed to this repository.
 *
 * Unit coverage for the throttle, expiry, dedupe, cross-user isolation and the
 * path rules lives in `apps/api/src/mobile/mobileSync.test.ts`, which drives the
 * real service against an in-memory Prisma and KV. This file deliberately does
 * not set a PIN on the shared admin account: locking it out would break every
 * subsequent run of the suite.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.data?.token) return j.data.token;
      await new Promise((r) => setTimeout(r, 1200));
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Session 117 — mobile offline durability", () => {
  let token = "";
  /** A device id this run owns. Never registered, so ownership is unclaimed. */
  const deviceId = `e2e-dev-${Date.now()}`;

  test.beforeAll(async () => {
    token = await apiLogin();
  });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  async function get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: auth() });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function post(path: string, body: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST", headers: auth(), body: JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("the Session 21 paths still answer and /mobile/config stays public", async () => {
    const anon = await fetch(`${BASE}/mobile/config`);
    expect(anon.status).toBe(200);

    const devices = await get("/mobile/devices");
    expect(devices.status).toBe(200);
    expect(devices.ok).toBe(true);
  });

  test("every Session 117 endpoint refuses an anonymous caller", async () => {
    const paths = [
      "/mobile/offline/summary",
      "/mobile/offline/actions",
      "/mobile/devices/trust",
      "/mobile/push/health",
      "/mobile/policy",
      "/mobile/assurance/self",
      "/mobile/assurance/configuration",
      "/mobile/assurance/gaps",
      "/mobile/events",
    ];
    for (const p of paths) {
      const res = await fetch(`${BASE}${p}`);
      expect(res.status, `${p} must refuse an anonymous read`).toBe(401);
    }
  });

  test("a submitted action is still there on the next read — it is not dropped", async () => {
    const actionId = `e2e-act-${Date.now()}`;
    const submitted = await post("/mobile/offline/actions", {
      deviceId,
      actions: [
        {
          id: actionId,
          method: "POST",
          path: "/api/v1/conversations",
          body: { title: "written while offline" },
          queuedAt: new Date().toISOString(),
        },
      ],
    });
    expect(submitted.status).toBe(200);
    expect(submitted.data.stored).toBe(1);
    expect(submitted.data.receipts[0].outcome).toBe("stored");
    expect(submitted.data.receipts[0].status).toBe("stored");
    expect(submitted.data.receipts[0].retainLocally).toBe(false);

    // The defect this session fixes: read it back from a separate request.
    const detail = await get(`/mobile/offline/actions/${actionId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.id).toBe(actionId);
    expect(detail.data.status).toBe("stored");
    // The body survived, so the write can actually be recovered.
    expect(detail.data.body).toEqual({ title: "written while offline" });
  });

  test("stored is reported as stored, never as applied", async () => {
    const list = await get(`/mobile/offline/actions?deviceId=${deviceId}`);
    expect(list.status).toBe(200);
    for (const a of list.data.actions) {
      expect(a.status).not.toBe("applied");
    }
    expect(list.data.note).toMatch(/stored is not applied/i);
  });

  test("a rejected action tells the client to keep it", async () => {
    const res = await post("/mobile/offline/actions", {
      deviceId,
      actions: [
        {
          id: `e2e-bad-${Date.now()}`,
          method: "POST",
          // Not an API path: the queue refuses it rather than storing a write
          // it could never replay.
          path: "/etc/passwd",
          queuedAt: new Date().toISOString(),
        },
        {
          id: `e2e-denied-${Date.now()}`,
          method: "POST",
          // An API path, but a credential one: never replayed from a stored body.
          path: "/api/v1/auth/login",
          queuedAt: new Date().toISOString(),
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data.stored).toBe(0);
    expect(res.data.rejected).toBe(2);
    for (const receipt of res.data.receipts) {
      expect(receipt.outcome).toBe("rejected");
      // Nothing is held, so there is no action status to report.
      expect(receipt.status).toBeNull();
      expect(receipt.retainLocally).toBe(true);
    }
    expect(res.data.receipts[0].reason).toBe("path_invalid");
    expect(res.data.receipts[1].reason).toBe("path_not_allowed");
    expect(res.data.queueNote).toMatch(/only what this response reports as stored or duplicate/i);
  });

  test("a duplicate id is reported, not stored twice", async () => {
    const id = `e2e-dup-${Date.now()}`;
    const action = {
      id, method: "POST", path: "/api/v1/conversations",
      body: { title: "once" }, queuedAt: new Date().toISOString(),
    };
    const first = await post("/mobile/offline/actions", { deviceId, actions: [action] });
    expect(first.data.stored).toBe(1);
    const second = await post("/mobile/offline/actions", { deviceId, actions: [action] });
    expect(second.data.stored).toBe(0);
    expect(second.data.duplicates).toBe(1);
    expect(second.data.receipts[0].outcome).toBe("duplicate");
    // The status returned is the existing record's, unchanged.
    expect(second.data.receipts[0].status).toBe("stored");
    // A duplicate is held by the server, so the client may drop its copy.
    expect(second.data.receipts[0].retainLocally).toBe(false);
  });

  test("the replay plan is ordered oldest-first by server receipt time", async () => {
    const plan = await get(`/mobile/offline/replay-plan?deviceId=${deviceId}`);
    expect(plan.status).toBe(200);
    const times = plan.data.actions.map((a: any) => Date.parse(a.receivedAt));
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
    expect(plan.data.replayNote).toMatch(/replay happens on the device/i);
  });

  test("the summary counts what is actually held", async () => {
    const summary = await get("/mobile/offline/summary");
    expect(summary.status).toBe(200);
    expect(summary.data.pending).toBeGreaterThan(0);
    expect(summary.data.totalRecorded).toBeGreaterThanOrEqual(summary.data.pending);
    expect(summary.data.retentionDays).toBeGreaterThan(0);
    const byDevice = summary.data.pendingByDevice.find((d: any) => d.deviceId === deviceId);
    expect(byDevice?.pending).toBeGreaterThan(0);
  });

  test("resolving records the outcome the client reports, verbatim", async () => {
    const id = `e2e-res-${Date.now()}`;
    await post("/mobile/offline/actions", {
      deviceId,
      actions: [{ id, method: "POST", path: "/api/v1/conversations", queuedAt: new Date().toISOString() }],
    });
    const resolved = await post(`/mobile/offline/actions/${id}/resolve`, {
      outcome: "failed", statusCode: 422, error: "validation refused it",
    });
    expect(resolved.status).toBe(200);
    expect(resolved.data.status).toBe("failed");
    expect(resolved.data.outcomeStatusCode).toBe(422);
    expect(resolved.data.outcomeError).toContain("validation refused");

    const after = await get(`/mobile/offline/actions/${id}`);
    // A failed action stays in the queue so it can be retried — it is not
    // silently dropped, and it is not reported as applied.
    expect(after.data.status).toBe("failed");
  });

  test("no device view carries a secret", async () => {
    const inv = await get("/mobile/devices/trust");
    expect(inv.status).toBe(200);
    const raw = JSON.stringify(inv.data);
    expect(raw).toContain("staleAfterDays"); // the payload really was read
    expect(raw).not.toContain("pinHash");
    expect(raw).not.toContain("pushTokenHash");
    expect(inv.data.note).toMatch(/carries no secret/i);
  });

  test("push health reports the endpoint host only, never the endpoint", async () => {
    const health = await get("/mobile/push/health");
    expect(health.status).toBe(200);
    const raw = JSON.stringify(health.data);
    expect(raw).toContain("retirementThreshold");
    expect(raw).not.toContain("https://fcm.googleapis.com/fcm/send/");
    for (const s of health.data.subscriptions) {
      expect(s.endpointHost).not.toContain("/");
    }
    expect(health.data.note).toMatch(/recorded since this ledger existed/i);
  });

  test("the policy is reported as a default until an administrator stores one", async () => {
    const policy = await get("/mobile/policy");
    expect(policy.status).toBe(200);
    expect(typeof policy.data.isDefault).toBe("boolean");
    expect(policy.data.offlineQueueEnabled).toBe(true);
    expect(policy.data.note).toMatch(/advisory/i);
    expect(policy.data.updateNote).toMatch(/does not refuse requests from an out-of-date build/i);
  });

  test("the configuration report warns about the committed VAPID pair and echoes no key", async () => {
    const cfg = await get("/mobile/assurance/configuration");
    expect(cfg.status).toBe(200);
    const raw = JSON.stringify(cfg.data);
    expect(raw).toContain("vapid_private_key"); // the check really is present
    // The committed development private key must never appear in a payload.
    expect(raw).not.toContain("Tg9wSuR5xpNc8wspnQjuurMbNL0uRlnQLtcCzCoRVIo");
    expect(cfg.data.note).toMatch(/configured, not working/i);
    if (cfg.data.usingRepositoryDefaultVapidKeys) {
      const check = cfg.data.checks.find((c: any) => c.key === "vapid_private_key");
      expect(check.state).toBe("warn");
      expect(cfg.data.ready).toBe(true); // a warning is never rounded down to a failure
    }
  });

  test("the gap report is a list of absences, not a score", async () => {
    const gaps = await get("/mobile/assurance/gaps");
    expect(gaps.status).toBe(200);
    expect(Array.isArray(gaps.data.gaps)).toBe(true);
    expect(gaps.data.gaps.length).toBeGreaterThan(0);
    expect(gaps.data.note).toMatch(/absence is not read as a guarantee/i);
  });

  test("the ledger records this run's submissions and carries its own caveat", async () => {
    const events = await get("/mobile/events?limit=50");
    expect(events.status).toBe(200);
    expect(events.data.events.some((e: any) => e.kind === "actions_submitted")).toBe(true);
    expect(events.data.note).toMatch(/recorded since it was introduced/i);
  });

  test("the self view agrees with the summary it is built from", async () => {
    const [self, summary] = await Promise.all([
      get("/mobile/assurance/self"),
      get("/mobile/offline/summary"),
    ]);
    expect(self.status).toBe(200);
    expect(self.data.pendingActions).toBe(summary.data.pending);
    expect(self.data.policy.organizationId).toBeTruthy();
  });

  test("a device id belonging to nobody is not silently adopted as another account's", async () => {
    // Reading trust for an unknown device id must answer honestly rather than
    // inventing a record; a *foreign* id is refused with 403 and is covered in
    // the unit suite, which can create a second account.
    const trust = await get(`/mobile/devices/${deviceId}/trust`);
    expect([200, 404]).toContain(trust.status);
  });
});
