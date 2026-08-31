// @vitest-environment happy-dom
/**
 * Validation page — the console for a report that fails closed.
 *
 * The ported report is deliberately unflattering: twelve systems wired, four
 * stub, nineteen missing, and a checklist that reports "not verified" instead
 * of passing on a sentence. The console has to render that honestly rather
 * than prettify it, so these tests pin down that:
 *
 *   * a fail badge is rendered for an item whose detail says it was not
 *     verified, and the detail text itself is on screen — the page must never
 *     hide the reason;
 *   * the consent and governance flags render as fail when the report says
 *     false, with the copy that points at the checklist for the reason;
 *   * the empty state says the figures came from the probe the page just
 *     triggered, not that there is no data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const reportFn = vi.fn();
const historyFn = vi.fn();
const listNotesFn = vi.fn();
const runFn = vi.fn();
const createNoteFn = vi.fn();
const updateNoteFn = vi.fn();
const deleteNoteFn = vi.fn();

vi.mock("@/lib/v76validation", () => ({
  v76Api: {
    report: (...a: unknown[]) => reportFn(...a),
    history: (...a: unknown[]) => historyFn(...a),
    listNotes: (...a: unknown[]) => listNotesFn(...a),
    run: (...a: unknown[]) => runFn(...a),
    createNote: (...a: unknown[]) => createNoteFn(...a),
    updateNote: (...a: unknown[]) => updateNoteFn(...a),
    deleteNote: (...a: unknown[]) => deleteNoteFn(...a),
  },
}));

import { V76ValidationPage } from "./V76ValidationPage";
import type { V76Status, V76ValidationReport } from "@windels/shared";

function system(key: string, name: string, status: V76Status, notes: string) {
  return { key: key as never, name, status, routesThroughKernel: status === "wired", notes };
}

function report(over: Partial<V76ValidationReport> = {}): V76ValidationReport {
  return {
    generatedAt: "2026-08-31T09:00:00.000Z",
    totalSystems: 3,
    wired: 1,
    stubs: 1,
    missing: 1,
    duplicatesDetected: 0,
    consentGateEnforced: false,
    governanceGateEnforced: false,
    systems: [
      system("kernel", "AI Kernel", "wired", "table `kernel_events` present in this deployment"),
      system("cloud", "Cloud Deployment", "stub", "out of scope: this package installs on one host via cPanel File Manager"),
      system("voice-studio", "Voice Studio", "missing", "no module for this system in this build"),
    ],
    checklist: [
      { item: "Kernel event routing verified (dispatch round-trip)", passed: true, detail: "kernel dispatch accepted the ping and the event is durable in kernel_events" },
      { item: "S36/S40 consent gate enforced on voice cloning", passed: false, detail: "not verified: no voice cloning in this build, and no consent gate probe exists; Node reported this as passing when its VoiceStudio import failed" },
      { item: "S80 Currency manipulation fraud guard active", passed: false, detail: "not applicable: no global currency module in this build" },
    ],
    ...over,
  };
}

function note(over: Record<string, unknown> = {}) {
  return {
    id: "v76-aaaaaaaa",
    title: "Runbook",
    body: "Re-run after every release.",
    tags: ["ops"],
    createdAt: "2026-08-31T09:00:00.000Z",
    createdBy: "user-1",
    ...over,
  } as never;
}

beforeEach(() => {
  reportFn.mockReset(); historyFn.mockReset(); listNotesFn.mockReset();
  runFn.mockReset(); createNoteFn.mockReset(); updateNoteFn.mockReset(); deleteNoteFn.mockReset();
  reportFn.mockResolvedValue(report());
  historyFn.mockResolvedValue([]);
  listNotesFn.mockResolvedValue([]);
  runFn.mockResolvedValue(report());
  createNoteFn.mockResolvedValue(note());
  updateNoteFn.mockResolvedValue(note());
  deleteNoteFn.mockResolvedValue(undefined);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("loading the console", () => {
  it("loads the report, the history and the notes together", async () => {
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByText("AI Kernel")).toBeTruthy());
    expect(reportFn).toHaveBeenCalled();
    expect(historyFn).toHaveBeenCalled();
    expect(listNotesFn).toHaveBeenCalled();
  });

  it("says where the figures came from when nothing was stored yet", async () => {
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByText("No stored reports yet")).toBeTruthy());
    expect(screen.getByText(/loading this page ran the first probe/)).toBeTruthy();
    expect(screen.getByText("No previous reports for this org.")).toBeTruthy();
    expect(screen.getByText("No notes yet for this org.")).toBeTruthy();
  });

  it("surfaces a load failure rather than rendering an empty report", async () => {
    reportFn.mockRejectedValue(new Error("Admins only"));
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByText("Error: Admins only")).toBeTruthy());
  });
});

describe("the rollup", () => {
  it("renders the counts the report measured", async () => {
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByText("Wired systems")).toBeTruthy());
    expect(screen.getByText("of 3")).toBeTruthy();
    const card = (title: string) => screen.getByText(title).closest("div[class*='rounded-xl']") as HTMLElement;
    expect(within(card("Wired systems")).getByText("1")).toBeTruthy();
    expect(within(card("Stubs")).getByText("1")).toBeTruthy();
    expect(within(card("Missing")).getByText("1")).toBeTruthy();
    expect(within(card("Duplicates detected")).getByText("0")).toBeTruthy();
  });

  it("renders the consent and governance flags as fail when the report says false", async () => {
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByText("Consent gate (S36/S40)")).toBeTruthy());
    const card = (title: string) => screen.getByText(title).closest("div[class*='rounded-xl']") as HTMLElement;
    const consent = card("Consent gate (S36/S40)");
    const governance = card("Governance gate (S39/S40/S81)");
    expect(within(consent).getByText("fail")).toBeTruthy();
    expect(within(governance).getByText("fail")).toBeTruthy();
    expect(within(consent).getByText(/the checklist item says why/)).toBeTruthy();
  });
});

describe("the checklist", () => {
  it("shows each item's verdict and the reason it was reached", async () => {
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByText("Kernel event routing verified (dispatch round-trip)")).toBeTruthy());
    expect(screen.getByText(/kernel dispatch accepted the ping/)).toBeTruthy();

    const consentItem = screen.getByText("S36/S40 consent gate enforced on voice cloning").closest("div[class*='border-b']") as HTMLElement;
    expect(within(consentItem).getByText("fail")).toBeTruthy();
    expect(within(consentItem).getByText(/not verified: no voice cloning in this build/)).toBeTruthy();

    const naItem = screen.getByText("S80 Currency manipulation fraud guard active").closest("div[class*='border-b']") as HTMLElement;
    expect(within(naItem).getByText("fail")).toBeTruthy();
    expect(within(naItem).getByText(/not applicable/)).toBeTruthy();
  });
});

describe("the systems table", () => {
  it("renders every status with the note that justified it", async () => {
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByText("Voice Studio")).toBeTruthy());
    expect(screen.getByText("wired")).toBeTruthy();
    expect(screen.getByText("stub")).toBeTruthy();
    expect(screen.getByText("missing")).toBeTruthy();
    expect(screen.getByText(/key: kernel · table `kernel_events` present in this deployment/)).toBeTruthy();
    expect(screen.getByText(/key: voice-studio · no module for this system in this build/)).toBeTruthy();
  });
});

describe("re-running the probe", () => {
  it("posts a run and reloads", async () => {
    render(<V76ValidationPage />);
    // By role: the empty-state banner also contains the words "Re-run probe".
    const button = await screen.findByRole("button", { name: /Re-run probe/ });
    await userEvent.click(button);
    await waitFor(() => expect(runFn).toHaveBeenCalled());
    await waitFor(() => expect(reportFn.mock.calls.length).toBeGreaterThan(1));
  });
});

describe("notes", () => {
  it("creates a note with its tags parsed out of the field", async () => {
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("title")).toBeTruthy());
    await userEvent.type(screen.getByPlaceholderText("title"), "Runbook");
    await userEvent.type(screen.getByPlaceholderText("body"), "Re-run after every release.");
    await userEvent.type(screen.getByPlaceholderText("tags (comma separated)"), "ops, release");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(createNoteFn).toHaveBeenCalledWith({
      title: "Runbook", body: "Re-run after every release.", tags: ["ops", "release"],
    }));
  });

  it("will not save a note with no title and no body", async () => {
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add note" })).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(createNoteFn).not.toHaveBeenCalled();
  });

  it("edits an existing note through the patch route", async () => {
    listNotesFn.mockResolvedValue([note()]);
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    await userEvent.click(screen.getByText("Edit"));
    await userEvent.clear(screen.getByPlaceholderText("title"));
    await userEvent.type(screen.getByPlaceholderText("title"), "Runbook v2");
    await userEvent.click(screen.getByRole("button", { name: "Update note" }));
    await waitFor(() => expect(updateNoteFn).toHaveBeenCalledWith("v76-aaaaaaaa", {
      title: "Runbook v2", body: "Re-run after every release.", tags: ["ops"],
    }));
  });

  it("deletes a note by id after the operator confirms", async () => {
    listNotesFn.mockResolvedValue([note()]);
    render(<V76ValidationPage />);
    await waitFor(() => expect(screen.getByText("Delete")).toBeTruthy());
    await userEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(deleteNoteFn).toHaveBeenCalledWith("v76-aaaaaaaa"));
    expect(window.confirm).toHaveBeenCalled();
  });
});
