// @vitest-environment happy-dom
/**
 * Autonomous Organization page — the approval-first register.
 *
 * The module's whole premise is that it proposes and records human decisions
 * while inventing nothing, so the tests hold it to that in both directions:
 * the numbers that ARE backed by rows (review rate, open approvals, approved
 * impact, per-department pending counts) must render from the API payload, and
 * the numbers that are NOT backed by any ledger (budgets, board seats, AI
 * executives, plans) must stay out of the UI rather than being filled in with
 * placeholder figures.
 *
 * The second thing pinned down here is the admin gate. The PHP backend rejects
 * propose/resolve/delete with 403 for a non-admin, so the page must not offer
 * those controls to a plain user in the first place.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const dashboardFn = vi.fn();
const decisionsFn = vi.fn();
const proposeFn = vi.fn();
const resolveFn = vi.fn();
const deleteFn = vi.fn();

vi.mock("@/lib/autonomous", () => ({
  autApi: {
    dashboard: (...a: unknown[]) => dashboardFn(...a),
    decisions: (...a: unknown[]) => decisionsFn(...a),
    getDecision: vi.fn(),
    propose: (...a: unknown[]) => proposeFn(...a),
    resolve: (...a: unknown[]) => resolveFn(...a),
    deleteDecision: (...a: unknown[]) => deleteFn(...a),
  },
}));

let role: "user" | "admin" | "super_admin" = "admin";
vi.mock("@/store/auth", () => ({
  useAuthStore: (selector: (state: { user: unknown }) => unknown) =>
    selector({ user: { id: "u-1", email: "board@windels.example", role, organizationId: "org-1" } }),
}));

import { AutonomousPage } from "./AutonomousPage";
import type { AutonomousDashboard, BoardDecision } from "@windels/shared/autonomous";

function decision(over: Partial<BoardDecision> = {}): BoardDecision {
  return {
    id: "decision-1",
    title: "Consolidate the Abuja logistics hub",
    department: "Finance",
    recommendation: "Move regional distribution to a single hub.",
    confidence: 0.82,
    riskLevel: "med",
    estimatedImpactUsd: 125000,
    status: "awaiting_human",
    // The shared type declares these optional rather than nullable; the PHP
    // runtime sends null, which is the same thing to every consumer here.
    humanApprover: undefined,
    reasoning: "Three overlapping contracts expire within the quarter.",
    createdAt: "2026-08-31T09:00:00.000Z",
    decidedAt: undefined,
    decisionNote: undefined,
    ...over,
  };
}

function dashboard(over: Partial<AutonomousDashboard> = {}): AutonomousDashboard {
  return {
    autonomyIndex: 60,
    decisionsToday: 5,
    humanOverrideRatePct: 33,
    governanceCompliancePct: 100,
    budgetsTotalUsd: 0,
    budgetsSpentYtdPct: 0,
    departmentsCount: 2,
    boardSeats: 0,
    aiExecutives: 0,
    decisions: [],
    departments: [
      { id: "dept-finance", name: "Finance", autonomyLevel: "recommend", health: 33, decisionsPending: 1, decisionsExecuted30d: 1, budgetUsd: 0, spendYtdUsd: 0, headcount: 0, aiAgents: 0 },
      { id: "dept-operations", name: "Operations", autonomyLevel: "recommend", health: 0, decisionsPending: 1, decisionsExecuted30d: 0, budgetUsd: 0, spendYtdUsd: 0, headcount: 0, aiAgents: 0 },
    ],
    plans: [],
    guardrails: [{ id: "human-approval-required", policy: "No autonomous action is executed by this module. Every proposal requires an authenticated human decision.", violations30d: 0, blockedActions30d: 2 }],
    openApprovals: 2,
    constitutionEnforced: 1,
    autonomousSavings30dUsd: 1100,
    impactKind: "approved_estimate",
    ...over,
  };
}

beforeEach(() => {
  cleanup();
  role = "admin";
  dashboardFn.mockReset();
  decisionsFn.mockReset();
  proposeFn.mockReset();
  resolveFn.mockReset();
  deleteFn.mockReset();
  dashboardFn.mockResolvedValue(dashboard());
  decisionsFn.mockResolvedValue([decision()]);
  proposeFn.mockResolvedValue(decision());
  resolveFn.mockResolvedValue(decision({ status: "approved" }));
  deleteFn.mockResolvedValue({ deleted: true, id: "decision-1" });
});

describe("AutonomousPage rendering", () => {
  it("loads the rollup and the register on mount", async () => {
    render(<AutonomousPage />);
    await waitFor(() => expect(dashboardFn).toHaveBeenCalled());
    expect(decisionsFn).toHaveBeenCalledWith({ limit: 100 });
    await waitFor(() => expect(screen.getByText("Consolidate the Abuja logistics hub")).toBeTruthy());
    expect(screen.getAllByText("Finance").length).toBeGreaterThan(0); // the decision badge and the derived department row
    expect(screen.getByText("awaiting_human")).toBeTruthy();
    // Confidence comes back from the API as a number; a string would render NaN%.
    expect(screen.getByText(/confidence 82%/)).toBeTruthy();
    expect(screen.getByText(/estimated impact \$125,000/)).toBeTruthy();
  });

  it("renders the rollup numbers the API actually returned", async () => {
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByText("60%")).toBeTruthy());
    expect(screen.getByText("Human review rate")).toBeTruthy();
    const open = screen.getByText("Open approvals").parentElement!;
    expect(within(open).getByText("2")).toBeTruthy();
    const impact = screen.getByText("Approved impact").parentElement!;
    expect(within(impact).getByText("$1,100")).toBeTruthy();
  });

  it("labels approved impact as an estimate rather than realized savings", async () => {
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByText(/approved estimate, not realized savings/)).toBeTruthy());
  });

  it("drops the estimate wording when nothing has been approved", async () => {
    dashboardFn.mockResolvedValue(dashboard({ autonomousSavings30dUsd: 0, impactKind: "none" }));
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByText("no approved estimate")).toBeTruthy());
    expect(screen.queryByText(/approved estimate, not realized savings/)).toBeNull();
  });

  it("states up front that the unfunded figures are not invented", async () => {
    render(<AutonomousPage />);
    expect(screen.getByText(/Budgets, executive seats, strategic plans and realized savings are not invented/)).toBeTruthy();
  });

  it("renders the derived departments and the guardrail", async () => {
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByText("Operations")).toBeTruthy());
    expect(screen.getByText("1 pending · 33% approved")).toBeTruthy();
    expect(screen.getByText(/No autonomous action is executed by this module/)).toBeTruthy();
    expect(screen.getByText("2 blocked")).toBeTruthy();
  });

  it("shows an empty register without inventing rows", async () => {
    decisionsFn.mockResolvedValue([]);
    dashboardFn.mockResolvedValue(dashboard({ departments: [], openApprovals: 0, autonomyIndex: 0 }));
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByText("No proposals recorded for this organization.")).toBeTruthy());
    expect(screen.getByText("No departments can be derived without proposals.")).toBeTruthy();
  });

  it("surfaces a load failure instead of showing an empty register", async () => {
    dashboardFn.mockRejectedValue(new Error("Decision register unavailable"));
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByText("Decision register unavailable")).toBeTruthy());
  });

  it("shows the human approver and note once a decision is resolved", async () => {
    decisionsFn.mockResolvedValue([decision({ status: "approved", humanApprover: "u-9", decisionNote: "Board approved at the Monday session.", decidedAt: "2026-08-31T10:00:00.000Z" })]);
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByText(/decided by u-9 · Board approved at the Monday session\./)).toBeTruthy());
    // A resolved decision offers no approve/reject controls.
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("AutonomousPage admin gate", () => {
  it("hides the proposal form and the resolve controls from a plain user", async () => {
    role = "user";
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByText("Consolidate the Abuja logistics hub")).toBeTruthy());
    expect(screen.getByText(/Read-only view\. Administrator access is required/)).toBeTruthy();
    expect(screen.queryByPlaceholderText("Title")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete draft" })).toBeNull();
  });

  it("offers the controls to a super admin as well as an org admin", async () => {
    role = "super_admin";
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("Title")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });
});

describe("AutonomousPage actions", () => {
  it("submits a proposal with numeric confidence and impact, then reloads", async () => {
    const user = userEvent.setup();
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("Title")).toBeTruthy());

    await user.type(screen.getByPlaceholderText("Title"), "Renegotiate the haulage contract");
    await user.type(screen.getByPlaceholderText("Department"), "Finance");
    await user.type(screen.getByPlaceholderText("Recommendation"), "Retender the freight lane.");
    await user.type(screen.getByPlaceholderText("Reasoning / evidence"), "Two carriers undercut the incumbent.");
    await user.clear(screen.getByPlaceholderText("Confidence 0–1"));
    await user.type(screen.getByPlaceholderText("Confidence 0–1"), "0.9");
    await user.clear(screen.getByPlaceholderText("Estimated impact USD"));
    await user.type(screen.getByPlaceholderText("Estimated impact USD"), "2500.5");
    await user.click(screen.getByRole("button", { name: /Submit for human approval/ }));

    await waitFor(() => expect(proposeFn).toHaveBeenCalled());
    const input = proposeFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.title).toBe("Renegotiate the haulage contract");
    expect(input.department).toBe("Finance");
    expect(input.confidence).toBe(0.9);
    expect(input.estimatedImpactUsd).toBe(2500.5);
    expect(typeof input.confidence).toBe("number");
    expect(typeof input.estimatedImpactUsd).toBe("number");
    await waitFor(() => expect(screen.getByText("Proposal submitted to the human approval inbox.")).toBeTruthy());
    expect(dashboardFn.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not submit an incomplete proposal", async () => {
    const user = userEvent.setup();
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("Title")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Submit for human approval/ }));
    expect(proposeFn).not.toHaveBeenCalled();
  });

  it("approves a pending proposal and records the console note", async () => {
    const user = userEvent.setup();
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(resolveFn).toHaveBeenCalledWith("decision-1", { approved: true, note: "Approved from Autonomous Organization console." }));
    await waitFor(() => expect(screen.getByText("Proposal approved.")).toBeTruthy());
  });

  it("rejects a pending proposal with its own note", async () => {
    const user = userEvent.setup();
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(resolveFn).toHaveBeenCalledWith("decision-1", { approved: false, note: "Rejected from Autonomous Organization console." }));
    await waitFor(() => expect(screen.getByText("Proposal rejected.")).toBeTruthy());
  });

  it("deletes a draft proposal and reloads the register", async () => {
    const user = userEvent.setup();
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete draft" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Delete draft" }));
    await waitFor(() => expect(deleteFn).toHaveBeenCalledWith("decision-1"));
    await waitFor(() => expect(screen.getByText("Draft proposal removed.")).toBeTruthy());
  });

  it("surfaces a rejected action instead of silently pretending it worked", async () => {
    const user = userEvent.setup();
    resolveFn.mockRejectedValue(new Error("Administrator access required"));
    render(<AutonomousPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByText("Administrator access required")).toBeTruthy());
    expect(screen.queryByText("Proposal approved.")).toBeNull();
  });
});
