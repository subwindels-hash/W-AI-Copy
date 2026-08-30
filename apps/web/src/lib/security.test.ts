/**
 * Security dashboard client — governance endpoints and event normalisation.
 *
 * The point of these tests is the contract, not the fetch: `api` is mocked, so
 * what is asserted is which path, verb, query string and body each control
 * sends, plus the two things the UI cannot get wrong:
 *
 *   * `normalizeEvent` must cope with BOTH shapes of /security/events, because
 *     the same bundle is served against the Node runtime (in-memory log ring)
 *     and the PHP runtime (durable audit rows).
 *   * the shared zod schemas must reject what the API rejects, so a bad request
 *     fails in the client with a readable message instead of a 422 from the
 *     server that the UI never explains.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CreateRunbookSchema,
  AttestAccessReviewSchema,
  UpdateSecurityIncidentSchema,
  RunAccessReviewSchema,
  CreateSecurityIncidentSchema,
} from "@windels/shared/security";

const apiFn = vi.fn();
vi.mock("./api", () => ({ api: (...a: unknown[]) => apiFn(...a) }));

import { securityApi, normalizeEvent } from "./security";

beforeEach(() => apiFn.mockReset());

const lastCall = () => apiFn.mock.calls[apiFn.mock.calls.length - 1] as [string, any];

describe("governance endpoints", () => {
  it("lists incidents with status and limit as query params", async () => {
    await securityApi.incidents({ status: "investigating", limit: 25 });
    const [path, init] = lastCall();
    expect(path).toBe("/security/incidents");
    expect(init.params).toEqual({ status: "investigating", limit: 25 });
    expect(init.method).toBeUndefined();
  });

  it("posts a new incident", async () => {
    const body = { title: "Suspicious login burst", description: "Many failures", severity: "high" as const, area: "auth" as const };
    await securityApi.reportIncident(body);
    const [path, init] = lastCall();
    expect(path).toBe("/security/incidents");
    expect(init.method).toBe("POST");
    expect(init.json).toEqual(body);
  });

  it("patches an incident with a status and note", async () => {
    await securityApi.updateIncident("inc-abc1234567", { status: "contained", note: "Blocked the ASN." });
    const [path, init] = lastCall();
    expect(path).toBe("/security/incidents/inc-abc1234567");
    expect(init.method).toBe("PATCH");
    expect(init.json).toEqual({ status: "contained", note: "Blocked the ASN." });
  });

  it("runs an access review with the dormant window", async () => {
    await securityApi.runAccessReview(30);
    const [path, init] = lastCall();
    expect(path).toBe("/security/access-reviews/run");
    expect(init.method).toBe("POST");
    expect(init.json).toEqual({ dormantDays: 30 });
  });

  it("reads the latest access review without inventing one when none exists", async () => {
    apiFn.mockResolvedValueOnce(null);
    await expect(securityApi.latestAccessReview()).resolves.toBeNull();
    expect(lastCall()[0]).toBe("/security/access-reviews/latest");
  });

  it("attests a review item", async () => {
    await securityApi.attestAccessItem("item-uuid", "QUARANTINED", "left the company");
    const [path, init] = lastCall();
    expect(path).toBe("/security/access-reviews/attest");
    expect(init.method).toBe("POST");
    expect(init.json).toEqual({ itemId: "item-uuid", status: "QUARANTINED", notes: "left the company" });
  });

  it("creates a runbook", async () => {
    await securityApi.createRunbook({
      name: "Revoke on critical", triggerSeverity: "critical", triggerArea: "data",
      actions: ["NOTIFY_ADMIN", "REVOKE_TOKENS"],
    });
    const [path, init] = lastCall();
    expect(path).toBe("/security/runbooks");
    expect(init.method).toBe("POST");
    expect(init.json.actions).toEqual(["NOTIFY_ADMIN", "REVOKE_TOKENS"]);
  });

  it("requests events with a limit", async () => {
    await securityApi.events(50);
    expect(lastCall()).toEqual(["/security/events", { params: { limit: 50 } }]);
  });
});

describe("normalizeEvent", () => {
  it("reads the PHP audit-row shape", () => {
    const e = normalizeEvent({
      id: "42", type: "security.incident_reported", at: "2026-08-30T22:35:28Z",
      actorId: "u-1", organizationId: "o-1", ip: "127.0.0.1", payload: { id: "inc-1" },
    });
    expect(e).toEqual({
      id: "42", at: "2026-08-30T22:35:28Z", type: "security.incident_reported",
      actor: "u-1", detail: '{"id":"inc-1"}', severity: "warn",
    });
  });

  it("reads the Node log-ring shape", () => {
    const e = normalizeEvent({ level: "error", time: "2026-08-30T22:35:28.123Z", msg: "prompt injection blocked" });
    expect(e.type).toBe("event");
    expect(e.at).toBe("2026-08-30T22:35:28.123Z");
    expect(e.detail).toBe("prompt injection blocked");
    expect(e.severity).toBe("error");
  });

  it("reports a missing actor as null rather than guessing", () => {
    expect(normalizeEvent({ type: "auth.login", at: "2026-08-30T22:35:28Z" }).actor).toBeNull();
  });

  it("treats revoked/quarantined audit types as errors", () => {
    expect(normalizeEvent({ type: "security.access_review_attested", payload: { status: "REVOKED" } }).severity).toBe("error");
    expect(normalizeEvent({ type: "security.access_review_attested", payload: { status: "APPROVED" } }).severity).toBe("info");
  });

  it("falls back to a synthetic id so keys stay stable", () => {
    const e = normalizeEvent({ type: "auth.login", at: "2026-08-30T22:35:28Z" });
    expect(e.id).toBe("2026-08-30T22:35:28Z:auth.login");
  });
});

describe("shared request schemas", () => {
  it("accepts a well-formed incident", () => {
    expect(CreateSecurityIncidentSchema.safeParse({
      title: "Ransomware attempt", description: "Contained by EDR", severity: "critical", area: "infra",
    }).success).toBe(true);
  });

  it("rejects an incident with an unknown area", () => {
    expect(CreateSecurityIncidentSchema.safeParse({
      title: "Ransomware attempt", description: "Contained by EDR", severity: "critical", area: "spaceship",
    }).success).toBe(false);
  });

  it("rejects a 2-character incident title", () => {
    expect(CreateSecurityIncidentSchema.safeParse({
      title: "no", description: "Contained by EDR", severity: "low", area: "other",
    }).success).toBe(false);
  });

  it("accepts a status-only incident update and a note-only one", () => {
    expect(UpdateSecurityIncidentSchema.safeParse({ status: "postmortem" }).success).toBe(true);
    expect(UpdateSecurityIncidentSchema.safeParse({ note: "customer notified" }).success).toBe(true);
    expect(UpdateSecurityIncidentSchema.safeParse({ status: "maybe" }).success).toBe(false);
  });

  it("bounds the dormant window to 7-365 days", () => {
    expect(RunAccessReviewSchema.safeParse({ dormantDays: 7 }).success).toBe(true);
    expect(RunAccessReviewSchema.safeParse({ dormantDays: 365 }).success).toBe(true);
    expect(RunAccessReviewSchema.safeParse({ dormantDays: 6 }).success).toBe(false);
    expect(RunAccessReviewSchema.safeParse({ dormantDays: 366 }).success).toBe(false);
  });

  it("rejects runbooks with unknown or empty actions", () => {
    const base = { name: "Notify admins", triggerSeverity: "high", triggerArea: "auth" };
    expect(CreateRunbookSchema.safeParse({ ...base, actions: ["NOTIFY_ADMIN"] }).success).toBe(true);
    expect(CreateRunbookSchema.safeParse({ ...base, actions: ["LAUNCH_MISSILES"] }).success).toBe(false);
    expect(CreateRunbookSchema.safeParse({ ...base, actions: [] }).success).toBe(false);
  });

  it("will not attest an item back to PENDING", () => {
    expect(AttestAccessReviewSchema.safeParse({ itemId: "x", status: "APPROVED" }).success).toBe(true);
    expect(AttestAccessReviewSchema.safeParse({ itemId: "x", status: "PENDING" }).success).toBe(false);
  });
});
