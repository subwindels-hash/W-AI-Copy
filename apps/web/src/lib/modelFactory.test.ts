/**
 * Model Factory client — request contract for the PHP/cPanel build.
 *
 * `api` is mocked, so what is asserted is the path, verb and body each call
 * sends. Three details matter here:
 *
 *   1. `benchmark` cannot send a score it did not receive. The route requires
 *      `benchmark`, `score` and `pass` — the earlier Node service invented all
 *      three — so the client passes an object rather than a bare name.
 *   2. `startFineTune` forwards `modelId` when the caller has one. Node's
 *      request schema does not declare `modelId`, so on the Node deployment it
 *      is dropped and every job is recorded with no model; the PHP build keeps
 *      it. Sending it is correct against both.
 *   3. The notes sub-routes are PATCH and DELETE on `/notes/:id`, not writes
 *      to a top-level collection endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFn = vi.fn();
vi.mock("./api", () => ({ api: (...a: unknown[]) => apiFn(...a) }));

import { mf2Api } from "./modelFactory";

beforeEach(() => {
  apiFn.mockReset();
  apiFn.mockResolvedValue({});
});

describe("model factory read endpoints", () => {
  it("requests the dashboard rollup", async () => {
    await mf2Api.dashboard();
    expect(apiFn).toHaveBeenCalledWith("/model-factory/dashboard/rollup");
  });

  it("requests every model when no stage filter is given", async () => {
    await mf2Api.models();
    expect(apiFn).toHaveBeenCalledWith("/model-factory/models", {});
  });

  it("passes a stage filter through as a query param", async () => {
    await mf2Api.models("canary");
    expect(apiFn).toHaveBeenCalledWith("/model-factory/models", { params: { stage: "canary" } });
  });

  it("lists fine-tune jobs", async () => {
    await mf2Api.fineTunes();
    expect(apiFn).toHaveBeenCalledWith("/model-factory/fine-tunes");
  });

  it("lists notes", async () => {
    await mf2Api.notes();
    expect(apiFn).toHaveBeenCalledWith("/model-factory/notes");
  });
});

describe("model factory write endpoints", () => {
  it("registers a model with the fields the route validates", async () => {
    const input = { name: "windels-slm-1b", builder: "slm" as const, size: "1B", quant: "q8", vramMb: 2000 };
    await mf2Api.create(input);
    expect(apiFn).toHaveBeenCalledWith("/model-factory/models", { method: "POST", json: input });
  });

  it("advances to exactly the stage it was given", async () => {
    await mf2Api.advance("m2-12345678", "canary");
    expect(apiFn).toHaveBeenCalledWith("/model-factory/models/m2-12345678/advance", {
      method: "POST",
      json: { to: "canary" },
    });
  });

  it("records a benchmark with the score and verdict it was handed", async () => {
    await mf2Api.benchmark("m2-12345678", { benchmark: "mmlu", score: 71.5, pass: false });
    expect(apiFn).toHaveBeenCalledWith("/model-factory/models/m2-12345678/benchmark", {
      method: "POST",
      json: { benchmark: "mmlu", score: 71.5, pass: false },
    });
  });

  it("sends a safety verdict as a boolean, not a string", async () => {
    await mf2Api.safety("m2-12345678", false);
    expect(apiFn).toHaveBeenCalledWith("/model-factory/models/m2-12345678/safety", {
      method: "POST",
      json: { passed: false },
    });
  });

  it("approves governance with no body at all", async () => {
    await mf2Api.approve("m2-12345678");
    expect(apiFn).toHaveBeenCalledWith("/model-factory/models/m2-12345678/governance-approve", { method: "POST" });
  });

  it("starts a fine-tune with the dataset and method", async () => {
    await mf2Api.startFineTune({ dataset: "sft-corpus-v3", method: "qlora" });
    expect(apiFn).toHaveBeenCalledWith("/model-factory/fine-tunes", {
      method: "POST",
      json: { dataset: "sft-corpus-v3", method: "qlora" },
    });
  });

  it("forwards the model it is tuning when it has one", async () => {
    await mf2Api.startFineTune({ modelId: "m2-12345678", dataset: "sft-corpus-v3", method: "lora" });
    expect(apiFn).toHaveBeenCalledWith("/model-factory/fine-tunes", {
      method: "POST",
      json: { modelId: "m2-12345678", dataset: "sft-corpus-v3", method: "lora" },
    });
  });
});

describe("model factory notes ledger", () => {
  it("creates a note", async () => {
    await mf2Api.createNote({ title: "Canary plan", body: "Roll out at 10%.", tags: ["canary"] });
    expect(apiFn).toHaveBeenCalledWith("/model-factory/notes", {
      method: "POST",
      json: { title: "Canary plan", body: "Roll out at 10%.", tags: ["canary"] },
    });
  });

  it("patches only what it names", async () => {
    await mf2Api.updateNote("mf-12345678", { title: "Canary plan v2" });
    expect(apiFn).toHaveBeenCalledWith("/model-factory/notes/mf-12345678", {
      method: "PATCH",
      json: { title: "Canary plan v2" },
    });
  });

  it("deletes a note by id", async () => {
    await mf2Api.deleteNote("mf-12345678");
    expect(apiFn).toHaveBeenCalledWith("/model-factory/notes/mf-12345678", { method: "DELETE" });
  });
});
