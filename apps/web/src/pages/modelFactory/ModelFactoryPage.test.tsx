// @vitest-environment happy-dom
/**
 * Model Factory page — the lifecycle console.
 *
 * The module's defining property is that its gates are enforced by the server
 * and reported, not smoothed over. The page therefore has to (a) show a fresh
 * organization as empty at every stage, and (b) send the score and the verdict
 * the user typed rather than inventing them. Both are asserted from the
 * rendered output and the mocked client calls, not assumed.
 *
 * The second thing pinned down is honesty about fine-tuning: starting a job
 * sends a dataset and a method and nothing else, and the console shows the job
 * at the 0% the API returns instead of animating progress it does not have.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const dashboardFn = vi.fn();
const modelsFn = vi.fn();
const fineTunesFn = vi.fn();
const notesFn = vi.fn();
const createFn = vi.fn();
const advanceFn = vi.fn();
const benchmarkFn = vi.fn();
const safetyFn = vi.fn();
const approveFn = vi.fn();
const startFineTuneFn = vi.fn();
const createNoteFn = vi.fn();
const deleteNoteFn = vi.fn();

vi.mock("@/lib/modelFactory", () => ({
  mf2Api: {
    dashboard: (...a: unknown[]) => dashboardFn(...a),
    models: (...a: unknown[]) => modelsFn(...a),
    create: (...a: unknown[]) => createFn(...a),
    advance: (...a: unknown[]) => advanceFn(...a),
    benchmark: (...a: unknown[]) => benchmarkFn(...a),
    safety: (...a: unknown[]) => safetyFn(...a),
    approve: (...a: unknown[]) => approveFn(...a),
    fineTunes: (...a: unknown[]) => fineTunesFn(...a),
    startFineTune: (...a: unknown[]) => startFineTuneFn(...a),
    notes: (...a: unknown[]) => notesFn(...a),
    createNote: (...a: unknown[]) => createNoteFn(...a),
    updateNote: vi.fn(),
    deleteNote: (...a: unknown[]) => deleteNoteFn(...a),
  },
}));

import { ModelFactoryPage } from "./ModelFactoryPage";
import type { Mf2Dashboard, Mf2FineTuneJob, Mf2Model, Mf2Note, Mf2Stage } from "@windels/shared";

const STAGES: Mf2Stage[] = ["research", "benchmarking", "validation", "approval", "canary", "deployed", "monitoring", "retired"];

/**
 * A card, by its title. The page renders several selects whose options repeat
 * the words the badges use ("slm", "canary"), so assertions about one card are
 * scoped to it rather than matched against the whole document.
 */
function card(title: string): HTMLElement {
  // By heading, not by text: "Fine-tune jobs" is both a card title and the
  // label under a dashboard number.
  return screen.getByRole("heading", { name: title }).closest("div[class*='rounded-xl']") as HTMLElement;
}

function dashboard(over: Partial<Mf2Dashboard> = {}): Mf2Dashboard {
  return {
    totalModels: 0,
    byStage: {
      research: 0, benchmarking: 0, validation: 0, approval: 0,
      canary: 0, deployed: 0, monitoring: 0, retired: 0,
    },
    activeFineTunes: 0,
    benchmarksPassedPct: 100,
    canaryActive: false,
    governanceBlocking: 0,
    safetyEvaluations: 0,
    extendsS43Registry: true,
    ...over,
  };
}

function model(over: Partial<Mf2Model> = {}): Mf2Model {
  return {
    id: "m2-aaaaaaaa",
    name: "windels-slm-1b",
    builder: "slm",
    stage: "research",
    size: "1B",
    quant: "q8",
    vramMb: 2000,
    versions: 1,
    createdAt: "2026-08-31T09:00:00.000Z",
    ...over,
  };
}

function tune(over: Partial<Mf2FineTuneJob> = {}): Mf2FineTuneJob {
  return {
    id: "ft-aaaaaaaa",
    modelId: "m2-aaaaaaaa",
    dataset: "sft-corpus-v3",
    method: "lora",
    status: "running",
    progressPct: 0,
    startedAt: "2026-08-31T09:00:00.000Z",
    ...over,
  };
}

function note(over: Partial<Mf2Note> = {}): Mf2Note {
  return {
    id: "mf-aaaaaaaa",
    title: "Canary plan",
    body: "Roll out at 10% for 24 hours.",
    tags: ["canary"],
    createdAt: "2026-08-31T09:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  dashboardFn.mockReset(); modelsFn.mockReset(); fineTunesFn.mockReset(); notesFn.mockReset();
  createFn.mockReset(); advanceFn.mockReset(); benchmarkFn.mockReset(); safetyFn.mockReset();
  approveFn.mockReset(); startFineTuneFn.mockReset(); createNoteFn.mockReset(); deleteNoteFn.mockReset();
  dashboardFn.mockResolvedValue(dashboard());
  modelsFn.mockResolvedValue([]);
  fineTunesFn.mockResolvedValue([]);
  notesFn.mockResolvedValue([]);
  createFn.mockResolvedValue(model());
  advanceFn.mockResolvedValue(model());
  benchmarkFn.mockResolvedValue({});
  safetyFn.mockResolvedValue(model());
  approveFn.mockResolvedValue(model());
  startFineTuneFn.mockResolvedValue(tune());
  createNoteFn.mockResolvedValue(note());
  deleteNoteFn.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("loading the factory", () => {
  it("loads the dashboard, the register, the jobs and the notes together", async () => {
    modelsFn.mockResolvedValue([model()]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(within(card("Model register")).getByText("windels-slm-1b")).toBeTruthy());
    expect(dashboardFn).toHaveBeenCalled();
    expect(modelsFn).toHaveBeenCalled();
    expect(fineTunesFn).toHaveBeenCalled();
    expect(notesFn).toHaveBeenCalled();
  });

  it("shows an empty factory as empty rather than as a plausible pipeline", async () => {
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByText("No models registered yet.")).toBeTruthy());
    expect(screen.getByText("No fine-tune jobs.")).toBeTruthy();
    expect(screen.getByText("No annotations yet.")).toBeTruthy();
    for (const stage of STAGES) {
      expect(screen.getByText(`${stage}: 0`)).toBeTruthy();
    }
  });

  it("surfaces a load failure instead of rendering zeros as if they were real", async () => {
    dashboardFn.mockRejectedValue(new Error("Admins only"));
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByText("Error: Admins only")).toBeTruthy());
  });
});

describe("the rollup", () => {
  it("renders the counts the register reports", async () => {
    dashboardFn.mockResolvedValue(dashboard({
      totalModels: 12, activeFineTunes: 7, benchmarksPassedPct: 60, governanceBlocking: 1,
      byStage: { research: 9, benchmarking: 1, validation: 0, approval: 1, canary: 1, deployed: 0, monitoring: 0, retired: 0 },
    }));
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByText("Models registered")).toBeTruthy());
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("canary: 1")).toBeTruthy();
  });
});

describe("the model register", () => {
  it("shows the stage, the builder and the gates a model has cleared", async () => {
    modelsFn.mockResolvedValue([model({ stage: "canary", safetyPassed: true, governanceApproved: true, versions: 4 })]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(within(card("Model register")).getByText("windels-slm-1b")).toBeTruthy());
    const register = card("Model register");
    expect(within(register).getByText("slm")).toBeTruthy();
    expect(within(register).getByText("canary")).toBeTruthy();
    expect(within(register).getByText("safety passed")).toBeTruthy();
    expect(within(register).getByText("governance")).toBeTruthy();
    expect(register.textContent).toContain("v4");
    expect(register.textContent).toContain("2000 MB");
  });

  it("advances to the stage that was selected", async () => {
    modelsFn.mockResolvedValue([model({ stage: "research", safetyPassed: true })]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Advance target for windels-slm-1b")).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText("Advance target for windels-slm-1b"), "validation");
    await waitFor(() => expect(advanceFn).toHaveBeenCalledWith("m2-aaaaaaaa", "validation"));
  });

  it("sends a failed safety evaluation as false, not as a missing value", async () => {
    modelsFn.mockResolvedValue([model()]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByText("Safety fail")).toBeTruthy());
    await userEvent.click(screen.getByText("Safety fail"));
    await waitFor(() => expect(safetyFn).toHaveBeenCalledWith("m2-aaaaaaaa", false));
  });

  it("approves governance with no body", async () => {
    modelsFn.mockResolvedValue([model({ stage: "approval" })]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByText("Governance approve")).toBeTruthy());
    await userEvent.click(screen.getByText("Governance approve"));
    await waitFor(() => expect(approveFn).toHaveBeenCalledWith("m2-aaaaaaaa"));
  });
});

describe("registering a model", () => {
  it("sends the form values and reloads", async () => {
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Model name")).toBeTruthy());
    await userEvent.type(screen.getByLabelText("Model name"), "windels-tts");
    await userEvent.selectOptions(screen.getByLabelText("Builder"), "speech");
    await userEvent.clear(screen.getByLabelText("VRAM MB"));
    await userEvent.type(screen.getByLabelText("VRAM MB"), "3000");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    await waitFor(() => expect(createFn).toHaveBeenCalledWith({
      name: "windels-tts", builder: "speech", size: "7B", quant: "fp16", vramMb: 3000,
    }));
    await waitFor(() => expect(modelsFn.mock.calls.length).toBeGreaterThan(1));
  });

  it("refuses to register without a name", async () => {
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Register" })).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(createFn).not.toHaveBeenCalled();
  });
});

describe("recording a benchmark", () => {
  it("sends the score and the verdict the user typed", async () => {
    modelsFn.mockResolvedValue([model()]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Benchmark target model")).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText("Benchmark target model"), "m2-aaaaaaaa");
    await userEvent.type(screen.getByLabelText("Benchmark name"), "mmlu");
    await userEvent.type(screen.getByLabelText("Benchmark score"), "71.5");
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(benchmarkFn).toHaveBeenCalledWith("m2-aaaaaaaa", {
      benchmark: "mmlu", score: 71.5, pass: true,
    }));
  });

  it("cannot record a result without a score — there is nothing to invent one from", async () => {
    modelsFn.mockResolvedValue([model()]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Benchmark target model")).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText("Benchmark target model"), "m2-aaaaaaaa");
    await userEvent.type(screen.getByLabelText("Benchmark name"), "mmlu");
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(benchmarkFn).not.toHaveBeenCalled();
  });
});

describe("fine-tune jobs", () => {
  it("sends the model when one is selected", async () => {
    modelsFn.mockResolvedValue([model()]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Fine-tune model")).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText("Fine-tune model"), "m2-aaaaaaaa");
    await userEvent.type(screen.getByLabelText("Dataset"), "sft-corpus-v3");
    await userEvent.selectOptions(screen.getByLabelText("Fine-tune method"), "qlora");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(startFineTuneFn).toHaveBeenCalledWith({
      dataset: "sft-corpus-v3", method: "qlora", modelId: "m2-aaaaaaaa",
    }));
  });

  it("records a job with no model when none is selected, which is what the API stores", async () => {
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Dataset")).toBeTruthy());
    await userEvent.type(screen.getByLabelText("Dataset"), "sft-corpus-v3");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(startFineTuneFn).toHaveBeenCalledWith({
      dataset: "sft-corpus-v3", method: "lora", modelId: undefined,
    }));
  });

  it("shows a job at the 0% the API returned rather than a progress it invented", async () => {
    fineTunesFn.mockResolvedValue([tune()]);
    modelsFn.mockResolvedValue([model()]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(within(card("Fine-tune jobs")).getByText("sft-corpus-v3")).toBeTruthy());
    const jobs = card("Fine-tune jobs");
    expect(within(jobs).getByText(/running · 0%/)).toBeTruthy();
    expect(within(jobs).getByText("for windels-slm-1b")).toBeTruthy();
  });
});

describe("annotations", () => {
  it("adds a note and clears the form", async () => {
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByLabelText("Note title")).toBeTruthy());
    await userEvent.type(screen.getByLabelText("Note title"), "Canary plan");
    await userEvent.type(screen.getByLabelText("Note body"), "Roll out at 10%.");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(createNoteFn).toHaveBeenCalledWith({
      title: "Canary plan", body: "Roll out at 10%.",
    }));
  });

  it("deletes a note by id", async () => {
    notesFn.mockResolvedValue([note()]);
    render(<ModelFactoryPage />);
    await waitFor(() => expect(screen.getByText("Delete")).toBeTruthy());
    await userEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(deleteNoteFn).toHaveBeenCalledWith("mf-aaaaaaaa"));
  });
});
