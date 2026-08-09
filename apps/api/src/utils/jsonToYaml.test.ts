/**
 * JSON → YAML serializer tests.
 *
 * Pins the indentation and quoting behaviour so the OpenAPI YAML export stays
 * valid and deterministic.
 */
import { describe, it, expect } from "vitest";
import { jsonToYaml } from "./jsonToYaml.js";

describe("jsonToYaml", () => {
  it("serializes a simple nested object with correct indentation", () => {
    const yaml = jsonToYaml({ openapi: "3.1.0", info: { title: "API", version: "1.0.0" } });
    expect(yaml).toBe(
      'openapi: "3.1.0"\n' +
      'info:\n' +
      '  title: API\n' +
      '  version: "1.0.0"\n',
    );
  });

  it("handles arrays of objects and empty arrays", () => {
    const yaml = jsonToYaml({ security: [{ bearerAuth: [] }], tags: ["v1"] });
    expect(yaml).toContain("security:");
    expect(yaml).toContain("  - bearerAuth: []");
    expect(yaml).toContain("tags:");
    expect(yaml).toContain("  - v1");
  });

  it("indents nested array-of-object entries under the dash", () => {
    const yaml = jsonToYaml({ security: [{ bearerAuth: ["write", "read"] }] });
    expect(yaml).toContain("- bearerAuth:");
    expect(yaml).toContain("    - write");
    expect(yaml).toContain("    - read");
  });

  it("renders scalars without quotes and booleans correctly", () => {
    const yaml = jsonToYaml({ deprecated: false, enabled: true, count: 5, none: null });
    expect(yaml).toContain("deprecated: false");
    expect(yaml).toContain("enabled: true");
    expect(yaml).toContain("count: 5");
    expect(yaml).toContain("none: null");
  });
});
