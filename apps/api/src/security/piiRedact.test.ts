import { describe, it, expect } from "vitest";
import { redact, redactString, redactHeaders } from "./piiRedact.js";

describe("piiRedact", () => {
  describe("redactString", () => {
    it("redacts emails", () => {
      expect(redactString("contact me at jane.doe@example.com ok")).toContain("[REDACTED_EMAIL]");
    });

    it("redacts JWTs", () => {
      const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      expect(redactString(`token=${jwt}`)).not.toContain(jwt);
    });
  });

  describe("redact — structural safety", () => {
    it("redacts sensitive keys case-insensitively", () => {
      const out = redact({ password: "hunter2", Token: "abc", nested: { apiKey: "k" } }) as any;
      expect(out.password).toBe("[REDACTED]");
      expect(out.Token).toBe("[REDACTED]");
      expect(out.nested.apiKey).toBe("[REDACTED]");
    });

    // Regression: a circular object used to recurse forever and crash the
    // process with "RangeError: Maximum call stack size exceeded". Because
    // logger.make() calls redact() on every log call, ANY cyclic meta object
    // (an Express req/res, a socket, a Prisma error) took down the API.
    it("does not blow the stack on a self-referencing object", () => {
      const cyclic: Record<string, unknown> = { name: "root" };
      cyclic.self = cyclic;
      expect(() => redact(cyclic)).not.toThrow();
      const out = redact(cyclic) as any;
      expect(out.name).toBe("root");
      expect(out.self).toBe("[Circular]");
    });

    it("handles mutual recursion between two objects", () => {
      const a: Record<string, unknown> = { id: "a" };
      const b: Record<string, unknown> = { id: "b", a };
      a.b = b;
      expect(() => redact(a)).not.toThrow();
    });

    it("handles cycles that go through an array", () => {
      const arr: unknown[] = [];
      arr.push({ list: arr });
      expect(() => redact(arr)).not.toThrow();
    });

    it("caps runaway depth on deeply nested structures", () => {
      let deep: Record<string, unknown> = { leaf: true };
      for (let i = 0; i < 5000; i++) deep = { child: deep };
      expect(() => redact(deep)).not.toThrow();
    });

    it("preserves a repeated (non-cyclic) sibling reference rather than dropping it", () => {
      const shared = { label: "shared" };
      const out = redact({ one: shared, two: shared }) as any;
      // Both branches are real data, not a cycle — neither should be lost.
      expect(out.one.label).toBe("shared");
      expect(out.two.label).toBe("shared");
    });

    it("leaves non-plain values intact", () => {
      expect(redact(null)).toBeNull();
      expect(redact(42)).toBe(42);
      expect(redact(true)).toBe(true);
    });

    it("does not stringify Date instances into garbage", () => {
      const d = new Date("2026-01-01T00:00:00.000Z");
      const out = redact({ when: d }) as any;
      expect(out.when instanceof Date || typeof out.when === "string").toBe(true);
    });

    it("survives an Error object with a circular cause", () => {
      const err: any = new Error("boom");
      err.cause = err;
      expect(() => redact({ err })).not.toThrow();
    });
  });

  describe("redactHeaders", () => {
    it("redacts credential headers", () => {
      const out = redactHeaders({ authorization: "Bearer abc", "x-api-key": "k", accept: "json" });
      expect(out.authorization).toBe("[REDACTED]");
      expect(out["x-api-key"]).toBe("[REDACTED]");
      expect(out.accept).toBe("json");
    });
  });
});
