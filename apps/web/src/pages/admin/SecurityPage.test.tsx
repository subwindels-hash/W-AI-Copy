// @vitest-environment happy-dom
/**
 * Security Center — governance tabs and honest header reporting.
 *
 * Two regressions this file exists to catch:
 *
 *   * the Overview tab used to print "Headers: all set" as a hardcoded string.
 *     The PHP runtime reports the headers it actually emitted, which is a
 *     smaller set than the Node build claims, so the stat has to count what the
 *     API sent — and name what is missing.
 *   * the three governance tabs (incidents, access reviews, runbooks) talk to
 *     endpoints that had no UI at all. Their wiring — including that a reported
 *     incident surfaces the runbook output — is exercised here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const scorecardFn = vi.fn();
const incidentsFn = vi.fn();
const reportIncidentFn = vi.fn();
const updateIncidentFn = vi.fn();
const runbooksFn = vi.fn();
const createRunbookFn = vi.fn();
const latestReviewFn = vi.fn();
const runReviewFn = vi.fn();
const attestFn = vi.fn();

vi.mock("@/lib/security", () => ({
  securityApi: {
    scorecard: (...a: unknown[]) => scorecardFn(...a),
    incidents: (...a: unknown[]) => incidentsFn(...a),
    reportIncident: (...a: unknown[]) => reportIncidentFn(...a),
    updateIncident: (...a: unknown[]) => updateIncidentFn(...a),
    runbooks: (...a: unknown[]) => runbooksFn(...a),
    createRunbook: (...a: unknown[]) => createRunbookFn(...a),
    latestAccessReview: (...a: unknown[]) => latestReviewFn(...a),
    runAccessReview: (...a: unknown[]) => runReviewFn(...a),
    attestAccessItem: (...a: unknown[]) => attestFn(...a),
  },
  normalizeEvent: (e: any) => ({ id: String(e?.id ?? ""), at: String(e?.at ?? ""), type: String(e?.type ?? ""), actor: e?.actorId ?? null, detail: "", severity: "info" as const }),
}));

vi.mock("@/lib/toast", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import SecurityPage from "./SecurityPage";
import type { SecurityScorecard, SecurityIncident, IncidentRunbook, AccessReviewRunResult } from "@windels/shared/security";

/** What the PHP runtime reports over plain HTTP with no CSP configured. */
function phpScorecard(): SecurityScorecard {
  return {
    selfTests: { passed: 9, total: 9 },
    promptInjectionsBlocked: 2,
    rateLimitedRequests: 0,
    openBreakers: 0,
    encryptionKeys: [{ id: "kfp-5094979c2b39", createdAt: null, primary: true }],
    headers: { hsts: false, csp: false, noSniff: true, xFrame: null, referrerPolicy: "strict-origin-when-cross-origin" },
    totalSecurityEvents: 2,
    score: 100,
  };
}

const incident: SecurityIncident = {
  id: "inc-f387830167",
  title: "Suspicious login burst",
  description: "Repeated failed logins from one ASN.",
  severity: "high",
  status: "reported",
  reportedBy: "u-1",
  area: "auth",
  createdAt: "2026-08-30T22:35:27Z",
  updatedAt: "2026-08-30T22:35:27Z",
  timeline: [
    { at: "2026-08-30T22:35:27Z", actor: "u-1", note: "Incident reported." },
    { at: "2026-08-30T22:35:27Z", actor: "system-runbook", note: "Executed runbook: Spec notify runbook" },
  ],
  runbookExecutions: [{ runbookId: "rb-1a2b3c4d", status: "success", output: { notify_admin: "Admin security notification dispatched." } }],
};

const runbook: IncidentRunbook = {
  id: "rb-1a2b3c4d", organizationId: "o-1", name: "Spec notify runbook",
  triggerSeverity: "high", triggerArea: "auth", actions: ["NOTIFY_ADMIN"],
  enabled: true, createdAt: "2026-08-30T22:35:00Z", executions: [],
};

const reviewResult: AccessReviewRunResult = {
  campaign: {
    id: "c-1", organizationId: "o-1", dormantDays: 90, status: "IN_PROGRESS",
    createdAt: "2026-08-30T22:36:00Z",
    items: [{ id: "i-1", campaignId: "c-1", userId: "u-9", status: "PENDING", reviewedById: null, notes: null, createdAt: "2026-08-30T22:36:00Z", updatedAt: "2026-08-30T22:36:00Z" }],
  },
  review: {
    campaignId: "c-1", generatedAt: "2026-08-30T22:36:00Z",
    dormantUsers: [{ userId: "u-9", email: "dormant@example.test", role: "USER", lastLoginAt: "2026-02-11T22:35:28Z", daysInactive: 200 }],
    adminCount: 1, superAdminCount: 0,
    recommendations: ["1 dormant accounts (>90d inactive) — review and attest or revoke."],
  },
};

beforeEach(() => {
  cleanup();
  scorecardFn.mockReset().mockResolvedValue(phpScorecard());
  incidentsFn.mockReset().mockResolvedValue([]);
  reportIncidentFn.mockReset().mockResolvedValue(incident);
  updateIncidentFn.mockReset().mockResolvedValue({ ...incident, status: "investigating" });
  runbooksFn.mockReset().mockResolvedValue([]);
  createRunbookFn.mockReset().mockResolvedValue(runbook);
  latestReviewFn.mockReset().mockResolvedValue(null);
  runReviewFn.mockReset().mockResolvedValue(reviewResult);
  attestFn.mockReset().mockResolvedValue({ id: "i-1", campaignId: "c-1", userId: "u-9", status: "APPROVED", reviewedById: "u-1", notes: null, createdAt: "2026-08-30T22:36:00Z", updatedAt: "2026-08-30T22:37:00Z" });
});

describe("SecurityPage overview", () => {
  it("counts the headers the API actually reported instead of claiming all are set", async () => {
    render(<SecurityPage />);
    await waitFor(() => expect(screen.getByText("2/5 active")).toBeTruthy());
    expect(screen.getByText("HSTS, CSP, X-Frame")).toBeTruthy();
  });

  it("shows every measured header with its real value", async () => {
    render(<SecurityPage />);
    await waitFor(() => expect(scorecardFn).toHaveBeenCalled());
    const list = screen.getByText("hsts").closest("li")!;
    expect(within(list).getByText("off")).toBeTruthy();
    expect(within(screen.getByText("referrerPolicy").closest("li")!).getByText("strict-origin-when-cross-origin")).toBeTruthy();
  });
});

describe("SecurityPage incidents", () => {
  it("reports an incident and shows the runbook that executed for it", async () => {
    const user = userEvent.setup();
    incidentsFn.mockResolvedValue([incident]);
    runbooksFn.mockResolvedValue([runbook]);
    render(<SecurityPage />);
    await user.click(screen.getByRole("tab", { name: "Incidents" }));

    await waitFor(() => expect(screen.getByText("Suspicious login burst")).toBeTruthy());
    expect(screen.getByText(/Spec notify runbook/)).toBeTruthy();
    expect(screen.getByText(/Admin security notification dispatched/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Report incident/ }));
    await user.type(screen.getByPlaceholderText("Incident title"), "New incident");
    await user.type(screen.getByPlaceholderText("What happened?"), "Something happened");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(reportIncidentFn).toHaveBeenCalled());
    expect(reportIncidentFn.mock.calls[0]![0]).toMatchObject({ title: "New incident", description: "Something happened", severity: "high", area: "auth" });
  });

  it("falls back to the raw id when the runbook is not in the list", async () => {
    const user = userEvent.setup();
    incidentsFn.mockResolvedValue([incident]);
    runbooksFn.mockResolvedValue([]);
    render(<SecurityPage />);
    await user.click(screen.getByRole("tab", { name: "Incidents" }));
    await waitFor(() => expect(screen.getByText(/rb-1a2b3c4d/)).toBeTruthy());
  });

  it("refuses to submit an incident without a title", async () => {
    const user = userEvent.setup();
    render(<SecurityPage />);
    await user.click(screen.getByRole("tab", { name: "Incidents" }));
    await user.click(screen.getByRole("button", { name: /Report incident/ }));
    await user.type(screen.getByPlaceholderText("What happened?"), "no title though");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(reportIncidentFn).not.toHaveBeenCalled();
  });
});

describe("SecurityPage access reviews", () => {
  it("runs a review, lists the dormant account, and attests it", async () => {
    const user = userEvent.setup();
    render(<SecurityPage />);
    await user.click(screen.getByRole("tab", { name: "Access Reviews" }));
    await user.click(screen.getByRole("button", { name: "Run review" }));

    await waitFor(() => expect(screen.getByText("dormant@example.test")).toBeTruthy());
    expect(runReviewFn).toHaveBeenCalledWith(90);
    expect(screen.getByText(/review and attest or revoke/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(attestFn).toHaveBeenCalledWith("i-1", "APPROVED");
  });

  it("shows a dormant account with no recorded activity as never recorded, not as a false date", async () => {
    const user = userEvent.setup();
    runReviewFn.mockResolvedValue({
      ...reviewResult,
      review: { ...reviewResult.review, dormantUsers: [{ userId: "u-9", email: "never@example.test", role: "USER", lastLoginAt: null, daysInactive: 200 }] },
    });
    render(<SecurityPage />);
    await user.click(screen.getByRole("tab", { name: "Access Reviews" }));
    await user.click(screen.getByRole("button", { name: "Run review" }));
    await waitFor(() => expect(screen.getByText("never@example.test")).toBeTruthy());
    expect(screen.getByText("never recorded")).toBeTruthy();
  });
});

describe("SecurityPage runbooks", () => {
  it("creates a runbook with the actions that were toggled on", async () => {
    const user = userEvent.setup();
    runbooksFn.mockResolvedValue([runbook]);
    render(<SecurityPage />);
    await user.click(screen.getByRole("tab", { name: "Runbooks" }));
    await user.click(screen.getByRole("button", { name: /New runbook/ }));
    await user.type(screen.getByPlaceholderText("Runbook name"), "Revoke on critical");
    await user.click(screen.getByRole("button", { name: "REVOKE_TOKENS" }));
    await user.click(screen.getByRole("button", { name: "Create runbook" }));

    await waitFor(() => expect(createRunbookFn).toHaveBeenCalled());
    const input = createRunbookFn.mock.calls[0]![0] as any;
    expect(input.name).toBe("Revoke on critical");
    expect(input.actions).toContain("REVOKE_TOKENS");
    expect(input.actions).toContain("NOTIFY_ADMIN");
  });
});
