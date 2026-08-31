/**
 * Validation client — request contract for the PHP/cPanel build.
 *
 * `api` is mocked, so what is asserted is the path, verb and body each call
 * sends. The point of the module is that the report it fetches is a set of
 * measurements, so the client has no business shaping them: `run` and `report`
 * send nothing, and the notes sub-routes are PATCH and DELETE on `/notes/:id`
 * rather than writes to a collection endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFn = vi.fn();
vi.mock("./api", () => ({ api: (...a: unknown[]) => apiFn(...a) }));

import { v76Api } from "./v76validation";

beforeEach(() => {
  apiFn.mockReset();
  apiFn.mockResolvedValue({});
});

describe("validation read endpoints", () => {
  it("reads the most recent report", async () => {
    await v76Api.report();
    expect(apiFn).toHaveBeenCalledWith("/validation/report");
  });

  it("re-runs the probe with a POST and no body", async () => {
    await v76Api.run();
    expect(apiFn).toHaveBeenCalledWith("/validation/run", { method: "POST" });
  });

  it("reads the organization's history", async () => {
    await v76Api.history();
    expect(apiFn).toHaveBeenCalledWith("/validation/history");
  });
});

describe("validation notes ledger", () => {
  it("lists notes", async () => {
    await v76Api.listNotes();
    expect(apiFn).toHaveBeenCalledWith("/validation/notes");
  });

  it("creates a note", async () => {
    await v76Api.createNote({ title: "Runbook", body: "Re-run after every release.", tags: ["ops"] });
    expect(apiFn).toHaveBeenCalledWith("/validation/notes", {
      method: "POST",
      json: { title: "Runbook", body: "Re-run after every release.", tags: ["ops"] },
    });
  });

  it("patches only what it names", async () => {
    await v76Api.updateNote("v76-12345678", { title: "Runbook v2" });
    expect(apiFn).toHaveBeenCalledWith("/validation/notes/v76-12345678", {
      method: "PATCH",
      json: { title: "Runbook v2" },
    });
  });

  it("deletes a note by id", async () => {
    await v76Api.deleteNote("v76-12345678");
    expect(apiFn).toHaveBeenCalledWith("/validation/notes/v76-12345678", { method: "DELETE" });
  });
});
