/**
 * ETL engine — real CSV/JSON parsing, mapping coercion/transforms, per-row DLQ,
 * honest run verdicts (succeeded/partial/failed) and honest remote-source
 * failures. The Redis-backed service is exercised against a fake kv.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseCsv, parseJson, coerce, applyTransform, mapRow } from "./etl.service.js";

describe("parseCsv", () => {
  it("parses headers + rows, respecting quoted fields", () => {
    const rows = parseCsv('name,amount\n"Ada, Lovelace",42\nBob,7', ",");
    expect(rows).toEqual([
      ["name", "amount"],
      ["Ada, Lovelace", "42"],
      ["Bob", "7"],
    ]);
  });
  it("handles escaped quotes and CRLF", () => {
    const rows = parseCsv('a,b\r\n"he said ""hi""",x\r\n');
    expect(rows[1]).toEqual(['he said "hi"', "x"]);
  });
  it("skips empty lines", () => {
    expect(parseCsv("a,b\n\n1,2\n", ",").length).toBe(2);
  });
});

describe("parseJson", () => {
  it("parses arrays and JSON-lines", () => {
    expect(parseJson('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(parseJson('{"a":1}\n{"a":2}')).toEqual([{ a: 1 }, { a: 2 }]);
  });
  it("treats a single object as JSON-lines and rejects malformed input", () => {
    expect(parseJson('{"a":1}')).toEqual([{ a: 1 }]);
    expect(() => parseJson('{"a":1,')).toThrow();
  });
});

describe("coerce + applyTransform", () => {
  it("coerces types and throws on invalid", () => {
    expect(coerce("42", "number")).toBe(42);
    expect(coerce("true", "boolean")).toBe(true);
    expect(coerce("2026-01-02", "date")).toBe("2026-01-02T00:00:00.000Z");
    expect(() => coerce("abc", "number")).toThrow(/cannot coerce/);
    expect(() => coerce("maybe", "boolean")).toThrow(/cannot coerce/);
  });
  it("applies transform rules", () => {
    expect(applyTransform("  hello ", "trim")).toBe("hello");
    expect(applyTransform("hi", "upper")).toBe("HI");
    expect(applyTransform("3.14159", "round2")).toBe(3.14);
    expect(applyTransform("7", "int")).toBe(7);
  });
});

describe("mapRow", () => {
  it("maps source columns to targets with coercion", () => {
    const schema = [
      { sourceColumn: "name", targetColumn: "fullName", type: "string", transformRule: "trim" },
      { sourceColumn: "amount", targetColumn: "amount", type: "number" },
    ];
    expect(mapRow({ name: "  Ada ", amount: "42.5" }, schema)).toEqual({ fullName: "Ada", amount: 42.5 });
  });
  it("throws on unmappable values", () => {
    const schema = [{ sourceColumn: "amount", targetColumn: "amount", type: "number" }];
    expect(() => mapRow({ amount: "nope" }, schema)).toThrow(/cannot coerce/);
  });
});

/* ── Full run semantics against a fake kv ───────────────────────── */

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    hashes = new Map<string, Record<string, string>>();
    sets = new Map<string, Set<string>>();
    lists = new Map<string, string[]>();
    async hset(k: string, f: string, v: string) { const h = this.hashes.get(k) ?? {}; h[f] = v; this.hashes.set(k, h); return 1; }
    async hget(k: string, f: string) { return this.hashes.get(k)?.[f] ?? null; }
    async hdel(k: string, f: string) { const h = this.hashes.get(k); if (h) delete h[f]; return 1; }
    async sadd(k: string, m: string) { const s = this.sets.get(k) ?? new Set(); s.add(m); this.sets.set(k, s); return 1; }
    async smembers(k: string) { return [...(this.sets.get(k) ?? [])]; }
    async srem(k: string, m: string) { this.sets.get(k)?.delete(m); return 1; }
    async lpush(k: string, v: string) { const l = this.lists.get(k) ?? []; l.unshift(v); this.lists.set(k, l); return l.length; }
    async ltrim(k: string, s: number, e: number) { const l = this.lists.get(k) ?? []; this.lists.set(k, l.slice(s, e + 1)); return "OK"; }
    async lrange(k: string, s: number, e: number) { const l = this.lists.get(k) ?? []; return l.slice(s, e === -1 ? undefined : e + 1); }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({
  redisCmd: fake,
}));

import { EtlService } from "./etl.service.js";

const OID = "org-etl";

async function settle() {
  await new Promise((r) => setTimeout(r, 15));
}

describe("EtlService.triggerRun (real execution)", () => {
  beforeEach(async () => {
    fake.hashes.clear(); fake.sets.clear(); fake.lists.clear();
  });

  it("CSV pipeline with inline payload → succeeded with REAL row counts", async () => {
    const pipe = await EtlService.createPipeline(OID, "u1", {
      name: "CSV ingest", sourceFormat: "CSV",
      sourceConfig: { type: "upload", delimiter: "," },
      mappingSchema: [
        { sourceColumn: "name", targetColumn: "fullName", type: "string", transformRule: "trim" },
        { sourceColumn: "amount", targetColumn: "amount", type: "number" },
      ],
    });
    const run = await EtlService.triggerRun(OID, pipe.id, { content: "name,amount\nAda,42\nBob,7\n" });
    await settle();
    const done = await EtlService.getRun(pipe.id, run.id);
    expect(done?.status).toBe("succeeded");
    expect(done?.rowsProcessed).toBe(2);
    expect(done?.rowsSucceeded).toBe(2);
    expect(done?.rowsFailed).toBe(0);
  });

  it("bad rows → partial verdict + DLQ entries with raw row + error", async () => {
    const pipe = await EtlService.createPipeline(OID, "u1", {
      name: "Dirty CSV", sourceFormat: "CSV",
      sourceConfig: { type: "upload" },
      mappingSchema: [{ sourceColumn: "amount", targetColumn: "amount", type: "number" }],
    });
    const run = await EtlService.triggerRun(OID, pipe.id, { content: "amount\n10\nnope\n20\n" });
    await settle();
    const done = await EtlService.getRun(pipe.id, run.id);
    expect(done?.status).toBe("partial");
    expect(done?.rowsSucceeded).toBe(2);
    expect(done?.rowsFailed).toBe(1);
    expect(done?.errorLog[0]?.error).toMatch(/cannot coerce/);
    const dlq = await EtlService.listDlq(OID, pipe.id);
    expect(dlq).toHaveLength(1);
    expect(dlq[0]?.rawRow).toContain("nope");
  });

  it("all rows bad → failed, not fabricated success", async () => {
    const pipe = await EtlService.createPipeline(OID, "u1", {
      name: "All bad", sourceFormat: "CSV",
      sourceConfig: { type: "upload" },
      mappingSchema: [{ sourceColumn: "amount", targetColumn: "amount", type: "number" }],
    });
    const run = await EtlService.triggerRun(OID, pipe.id, { content: "amount\nx\ny\n" });
    await settle();
    const done = await EtlService.getRun(pipe.id, run.id);
    expect(done?.status).toBe("failed");
    expect(done?.rowsSucceeded).toBe(0);
    expect(done?.rowsFailed).toBe(2);
  });

  it("remote source without credentials → SOURCE_NOT_CONFIGURED (honest)", async () => {
    const pipe = await EtlService.createPipeline(OID, "u1", {
      name: "SFTP", sourceFormat: "CSV",
      sourceConfig: { type: "sftp" },
      mappingSchema: [{ sourceColumn: "a", targetColumn: "a", type: "string" }],
    });
    const run = await EtlService.triggerRun(OID, pipe.id);
    await settle();
    const done = await EtlService.getRun(pipe.id, run.id);
    expect(done?.status).toBe("failed");
    expect(done?.errorSummary).toMatch(/SOURCE_NOT_CONFIGURED|credentials/i);
  });

  it("JSON array source runs end-to-end", async () => {
    const pipe = await EtlService.createPipeline(OID, "u1", {
      name: "JSON ingest", sourceFormat: "JSON",
      sourceConfig: { type: "upload" },
      mappingSchema: [{ sourceColumn: "n", targetColumn: "n2", type: "number", transformRule: "round2" }],
    });
    const run = await EtlService.triggerRun(OID, pipe.id, { content: '[{"n":"1.234"},{"n":"9.876"}]' });
    await settle();
    const done = await EtlService.getRun(pipe.id, run.id);
    expect(done?.status).toBe("succeeded");
    expect(done?.rowsProcessed).toBe(2);
  });
});
