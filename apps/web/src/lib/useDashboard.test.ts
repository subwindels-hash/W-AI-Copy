/**
 * Session 202 — dashboard store tests.
 *
 * The workspace dashboard store drives the main authenticated view. Its logic
 * worth locking down:
 *   - fetch(): loading/error state transitions and data commit
 *   - createTask()/updateTaskStatus(): issue the mutation then re-fetch
 *   - updateTaskStatus() only includes `progress` in the payload when provided
 *
 * The api module is mocked so no network/DOM is required (runs in node env).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn();
vi.mock("./api", () => ({ api: (...args: unknown[]) => apiMock(...args) }));

import { useDashboard } from "./useDashboard";

const sampleData = {
  organization: { id: "o1", name: "Org", slug: "org" },
  workspace: null,
  stats: { agentsTotal: 0, agentsOnline: 0, tasksActive: 0, tasksPending: 0, tasksDone: 0 },
  agents: [],
  tasks: [],
  activities: [],
};

beforeEach(() => {
  apiMock.mockReset();
  useDashboard.setState({ data: null, loading: false, error: null });
});

describe("fetch", () => {
  it("commits data and clears loading on success", async () => {
    apiMock.mockResolvedValueOnce(sampleData);
    await useDashboard.getState().fetch();
    const s = useDashboard.getState();
    expect(s.data).toEqual(sampleData);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
    expect(apiMock).toHaveBeenCalledWith("/workspace/dashboard");
  });

  it("captures the error message and clears loading on failure", async () => {
    apiMock.mockRejectedValueOnce(new Error("boom"));
    await useDashboard.getState().fetch();
    const s = useDashboard.getState();
    expect(s.error).toBe("boom");
    expect(s.loading).toBe(false);
    expect(s.data).toBeNull();
  });
});

describe("createTask", () => {
  it("POSTs the title then re-fetches the dashboard", async () => {
    apiMock
      .mockResolvedValueOnce(undefined) // POST
      .mockResolvedValueOnce(sampleData); // refetch
    await useDashboard.getState().createTask("Ship it");
    expect(apiMock).toHaveBeenNthCalledWith(1, "/workspace/tasks", { method: "POST", json: { title: "Ship it" } });
    expect(apiMock).toHaveBeenNthCalledWith(2, "/workspace/dashboard");
    expect(useDashboard.getState().data).toEqual(sampleData);
  });
});

describe("updateTaskStatus", () => {
  it("PATCHes status only when progress is omitted", async () => {
    apiMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(sampleData);
    await useDashboard.getState().updateTaskStatus("t1", "DONE");
    expect(apiMock).toHaveBeenNthCalledWith(1, "/workspace/tasks/t1", {
      method: "PATCH",
      json: { status: "DONE" },
    });
  });

  it("includes progress in the PATCH payload when provided", async () => {
    apiMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(sampleData);
    await useDashboard.getState().updateTaskStatus("t2", "IN_PROGRESS", 42);
    expect(apiMock).toHaveBeenNthCalledWith(1, "/workspace/tasks/t2", {
      method: "PATCH",
      json: { status: "IN_PROGRESS", progress: 42 },
    });
    expect(apiMock).toHaveBeenNthCalledWith(2, "/workspace/dashboard");
  });

  it("still includes progress when it is 0 (not undefined)", async () => {
    apiMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(sampleData);
    await useDashboard.getState().updateTaskStatus("t3", "TODO", 0);
    expect(apiMock).toHaveBeenNthCalledWith(1, "/workspace/tasks/t3", {
      method: "PATCH",
      json: { status: "TODO", progress: 0 },
    });
  });
});
