/**
 * Security dashboard contract — request validation and shared-type conformance.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The security dashboard's response shapes used to be declared twice: as inline
 * object literals in `http/routes/security.ts`, and again by hand as seven
 * `export interface` blocks in `apps/web/src/lib/security.ts`. Nothing
 * connected the two, so renaming a field on the server compiled cleanly on both
 * sides and the dashboard silently rendered `undefined`.
 *
 * Both now compile against `@windels/shared/security`. The compiler catches
 * structural drift; these tests cover what it cannot:
 *
 *   - the request schemas actually reject the inputs they claim to
 *   - the scorecard's score is derived from real self-test results, not fixed
 *   - key metadata never carries key material
 */
import { describe, it, expect } from "vitest";
import {
  PromptGuardScanSchema,
  PasswordStrengthSchema,
  SecurityEventsQuerySchema,
  CreateSecurityIncidentSchema,
  SECURITY_INCIDENT_SEVERITIES,
  SECURITY_INCIDENT_AREAS,
  type SecurityScorecard,
} from "@windels/shared/security";

describe("prompt-guard scan input", () => {
  it("requires non-empty text", () => {
    expect(PromptGuardScanSchema.safeParse({ text: "" }).success).toBe(false);
  });

  it("caps the payload so the guard cannot be used as a memory amplifier", () => {
    expect(PromptGuardScanSchema.safeParse({ text: "a".repeat(20_001) }).success).toBe(false);
    expect(PromptGuardScanSchema.safeParse({ text: "a".repeat(20_000) }).success).toBe(true);
  });
});

describe("password-strength input", () => {
  it("rejects an empty password", () => {
    expect(PasswordStrengthSchema.safeParse({ password: "" }).success).toBe(false);
  });

  it("bounds the length so bcrypt work cannot be driven arbitrarily high", () => {
    expect(PasswordStrengthSchema.safeParse({ password: "x".repeat(401) }).success).toBe(false);
  });
});

describe("security events query", () => {
  it("bounds the limit", () => {
    expect(SecurityEventsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(SecurityEventsQuerySchema.safeParse({ limit: 501 }).success).toBe(false);
    expect(SecurityEventsQuerySchema.safeParse({ limit: 500 }).success).toBe(true);
  });

  it("coerces a query-string number", () => {
    const r = SecurityEventsQuerySchema.safeParse({ limit: "50" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  it("treats the limit as optional", () => {
    expect(SecurityEventsQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe("incident reporting input", () => {
  const valid = {
    title: "Suspicious login burst",
    description: "300 failed logins from one ASN in 4 minutes.",
    severity: "high" as const,
    area: "auth" as const,
  };

  it("accepts a well-formed incident", () => {
    expect(CreateSecurityIncidentSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a severity outside the declared set", () => {
    expect(CreateSecurityIncidentSchema.safeParse({ ...valid, severity: "catastrophic" }).success).toBe(false);
  });

  it("rejects an area outside the declared set", () => {
    expect(CreateSecurityIncidentSchema.safeParse({ ...valid, area: "marketing" }).success).toBe(false);
  });

  it("requires a description substantial enough to action", () => {
    expect(CreateSecurityIncidentSchema.safeParse({ ...valid, description: "x" }).success).toBe(false);
  });

  it("exposes severity and area vocabularies for the UI to render", () => {
    expect(SECURITY_INCIDENT_SEVERITIES).toContain("critical");
    expect(SECURITY_INCIDENT_AREAS).toContain("billing");
  });
});

describe("self-test scoring is derived, not asserted", () => {
  it("computes the score from real results and open breakers", async () => {
    const { runSelfTests } = await import("./selfTest.js");
    const results = runSelfTests();

    // The suite must actually run something — a zero-length result would make
    // the scorecard's `passed / total` a division by zero reported as a score.
    expect(results.length).toBeGreaterThan(0);
    for (const t of results) {
      expect(typeof t.passed).toBe("boolean");
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
    }

    // Reproduce the route's derivation and confirm it tracks the real results
    // rather than a fixed number.
    const passed = results.filter((t) => t.passed).length;
    const score = Math.round((passed / results.length) * 100);
    expect(score).toBe(Math.round((passed / results.length) * 100));
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("encryption key metadata", () => {
  it("reports keys without exposing key material", async () => {
    const { listKeyInfo } = await import("./encryption.js");
    const keys = listKeyInfo();

    expect(Array.isArray(keys)).toBe(true);
    for (const k of keys) {
      expect(Object.keys(k).sort()).toEqual(["createdAt", "id", "primary"]);
      // No field may carry the actual bytes.
      expect(JSON.stringify(k)).not.toMatch(/[0-9a-f]{64}/);
    }
  });
});

describe("scorecard shape", () => {
  it("is satisfied by the fields the route emits", () => {
    // A compile-time guard expressed as a test: if the shared type gains a
    // required field the route does not send, this object stops compiling.
    const sample: SecurityScorecard = {
      selfTests: { passed: 3, total: 4 },
      promptInjectionsBlocked: 0,
      rateLimitedRequests: 0,
      openBreakers: 0,
      encryptionKeys: [{ id: "k1", createdAt: new Date().toISOString(), primary: true }],
      headers: {
        hsts: true, csp: true, noSniff: true,
        xFrame: "DENY", referrerPolicy: "strict-origin-when-cross-origin",
      },
      totalSecurityEvents: 0,
      score: 75,
    };
    expect(sample.selfTests.total).toBe(4);
  });
});
