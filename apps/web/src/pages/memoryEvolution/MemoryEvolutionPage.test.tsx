// @vitest-environment happy-dom
/**
 * Memory Evolution page — the nine-type memory register.
 *
 * The module's defining property is that a fresh organization reports an empty
 * register. Node's service carried nine sample memories (platform mission,
 * voice-consent policy, team standups) behind a demo-data flag, and a build
 * that seeded them would look like real enterprise knowledge on screen. The
 * empty state is therefore asserted from the rendered output, not assumed.
 *
 * The second thing pinned down is what the console sends when it stores a
 * memory: the page supplies `scope: "enterprise:windels"` itself, so a reader
 * of the register cannot mistake that default for a scope the user chose.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const dashboardFn = vi.fn();
const recallFn = vi.fn();
const addFn = vi.fn();

vi.mock("@/lib/memoryEvolution", () => ({
  meApi: {
    dashboard: (...a: unknown[]) => dashboardFn(...a),
    recall: (...a: unknown[]) => recallFn(...a),
    add: (...a: unknown[]) => addFn(...a),
    consolidate: vi.fn(),
    consolidations: vi.fn(),
    share: vi.fn(),
  },
}));

import { MemoryEvolutionPage } from "./MemoryEvolutionPage";
import type { MeDashboard, MeMemory } from "@windels/shared";

const TYPE_ZEROS = {
  episodic: 0, semantic: 0, procedural: 0, organizational: 0, department: 0,
  project: 0, user: 0, team: 0, knowledge: 0,
};

function memory(over: Partial<MeMemory> = {}): MeMemory {
  return {
    id: "mem-aaaaaaaa",
    type: "knowledge",
    content: "Exchange rate fallback is used when live/cache are unavailable.",
    confidence: 0.92,
    accessCount: 1,
    lastAccessedAt: "2026-08-31T09:00:00.000Z",
    createdAt: "2026-08-31T09:00:00.000Z",
    decayedStrength: 1,
    tags: ["currency", "fallback"],
    scope: "enterprise:knowledge",
    ...over,
  };
}

function dashboard(over: Partial<MeDashboard> = {}): MeDashboard {
  return {
    memoriesByType: { ...TYPE_ZEROS },
    total: 0,
    avgConfidence: 0,
    consolidationJobs24h: 0,
    duplicatesMerged: 0,
    memoriesForgotten: 0,
    crossAgentShares: 0,
    agingActive: true,
    intelligentForgettingActive: true,
    extendsS37Fabric: true,
    ...over,
  };
}

beforeEach(() => {
  cleanup();
  dashboardFn.mockReset();
  recallFn.mockReset();
  addFn.mockReset();
  dashboardFn.mockResolvedValue(dashboard());
  recallFn.mockResolvedValue([]);
  addFn.mockResolvedValue(memory());
});

describe("MemoryEvolutionPage — a fresh organization", () => {
  it("loads the rollup and the register together", async () => {
    render(<MemoryEvolutionPage />);
    await waitFor(() => expect(dashboardFn).toHaveBeenCalled());
    expect(recallFn).toHaveBeenCalledWith({ limit: 20 });
  });

  it("reports an empty register instead of sample memories", async () => {
    render(<MemoryEvolutionPage />);
    await waitFor(() => expect(screen.getByText("Total memories")).toBeTruthy());
    expect(screen.getByText("No memories — add one above.")).toBeTruthy();
    const total = screen.getByText("Total memories").parentElement!;
    expect(total.textContent).toContain("0");
  });

  it("surfaces a load failure rather than an empty register", async () => {
    dashboardFn.mockRejectedValue(new Error("Memory register unavailable"));
    render(<MemoryEvolutionPage />);
    await waitFor(() => expect(screen.getByText(/Error: Memory register unavailable/)).toBeTruthy());
  });
});

describe("MemoryEvolutionPage — a populated register", () => {
  it("renders the rollup numbers the API returned", async () => {
    dashboardFn.mockResolvedValue(dashboard({ total: 9, avgConfidence: 0.9, consolidationJobs24h: 3 }));
    render(<MemoryEvolutionPage />);
    await waitFor(() => expect(screen.getByText("Total memories")).toBeTruthy());
    expect(screen.getByText("Total memories").parentElement!.textContent).toContain("9");
    expect(screen.getByText("Avg confidence").parentElement!.textContent).toContain("0.9");
    expect(screen.getByText("Consolidations 24h").parentElement!.textContent).toContain("3");
  });

  it("shows each memory with its type, scope, confidence and tags", async () => {
    recallFn.mockResolvedValue([memory(), memory({ id: "mem-bbbbbbbb", type: "team", content: "Platform team holds Wed standups.", tags: [], scope: "team:platform", confidence: 0.85 })]);
    render(<MemoryEvolutionPage />);
    await waitFor(() => expect(screen.getByText("Exchange rate fallback is used when live/cache are unavailable.")).toBeTruthy());
    // "knowledge" is also an option in the type selector; the badge is the one
    // inside the register card.
    const register = screen.getByText("Recent memories").closest("div[class*='rounded-xl']") as HTMLElement;
    expect(within(register).getByText("knowledge")).toBeTruthy();
    expect(within(register).getByText("enterprise:knowledge")).toBeTruthy();
    expect(within(register).getByText(/c 92% · currency, fallback/)).toBeTruthy();
    expect(within(register).getByText("Platform team holds Wed standups.")).toBeTruthy();
    expect(within(register).getByText("team:platform")).toBeTruthy();
    expect(within(register).getByText(/c 85%/)).toBeTruthy();
  });
});

describe("MemoryEvolutionPage — storing a memory", () => {
  it("sends the content with the type and the page's default scope", async () => {
    const user = userEvent.setup();
    render(<MemoryEvolutionPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("Memory content")).toBeTruthy());

    await user.selectOptions(screen.getByRole("combobox"), "procedural");
    await user.type(screen.getByPlaceholderText("Memory content"), "Voice clones need explicit consent.");
    await user.click(screen.getByRole("button", { name: "Store" }));

    await waitFor(() => expect(addFn).toHaveBeenCalled());
    const input = addFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.type).toBe("procedural");
    expect(input.content).toBe("Voice clones need explicit consent.");
    // The scope is the page's default, not something the user chose here.
    expect(input.scope).toBe("enterprise:windels");
    await waitFor(() => expect(recallFn.mock.calls.length).toBeGreaterThan(1));
  });

  it("does not store an empty memory", async () => {
    const user = userEvent.setup();
    render(<MemoryEvolutionPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Store" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Store" }));
    expect(addFn).not.toHaveBeenCalled();
  });

  it("surfaces a rejected store instead of pretending it worked", async () => {
    const user = userEvent.setup();
    addFn.mockRejectedValue(new Error("type must be one of: episodic, semantic, procedural, organizational, department, project, user, team, knowledge"));
    render(<MemoryEvolutionPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("Memory content")).toBeTruthy());
    await user.type(screen.getByPlaceholderText("Memory content"), "Something remembered.");
    await user.click(screen.getByRole("button", { name: "Store" }));
    await waitFor(() => expect(screen.getByText(/type must be one of/)).toBeTruthy());
  });
});
