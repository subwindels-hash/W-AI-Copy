import { describe, it, expect } from "vitest";
import { formatCents, formatCentsCompact, parseMajorUnitsToCents } from "./money";
describe("money", () => {
  it("formats the case the commerce console got wrong", () => {
    // A product priced at $9.99 is stored as 999 cents and must render "$9.99",
    // not "$0.0999" (the old `price / 100` on a non-cents field).
    expect(formatCents(999)).toBe("$9.99");
  });
  it("formats zero and large amounts", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
  });
  it("renders unmeasured amounts as an em dash, never $0.00", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
  });
  it("honours currency", () => {
    expect(formatCents(500, "EUR")).toBe("€5.00");
  });
  it("compact drops minor units", () => {
    expect(formatCentsCompact(123456)).toBe("$1,235");
  });
  it("parses major units to integer cents", () => {
    expect(parseMajorUnitsToCents("9.99")).toBe(999);
    expect(parseMajorUnitsToCents("$1,000")).toBe(100000);
    expect(parseMajorUnitsToCents("0.1")).toBe(10);
  });
  it("rejects junk rather than submitting a wrong price", () => {
    expect(parseMajorUnitsToCents("abc")).toBeNull();
    expect(parseMajorUnitsToCents("-5")).toBeNull();
    expect(parseMajorUnitsToCents("")).toBeNull();
  });
});
