/**
 * DEMO-CLEANUP GUARD — pins the Session 1 demo-cleanup security fixes so they
 * cannot silently regress.
 *
 * These files generate credentials/identifiers or control the DB fallback, and
 * were previously under the broad `services/` / `observability` allowlist in
 * noRandomData.guard.test.ts, so a Math.random() regression there would pass
 * the generic guard. This file asserts the specific production-safe properties:
 *
 *   1. API keys are drawn from the CSPRNG, not Math.random().
 *   2. Invoice numbers use the CSPRNG (collision-safe), not Math.random().
 *   3. Observability trace/span ids use the CSPRNG, not Math.random().
 *   4. The in-memory DB fallback is gated behind WINDELS_ALLOW_MOCK_DB_FALLBACK
 *      and never allowed in production (fail-closed), not auto-enabled.
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");

async function read(rel: string): Promise<string> {
  return fs.readFile(path.join(SRC, rel), "utf8");
}

describe("Session 1 demo-cleanup security guards", () => {
  it("API-key generation uses the CSPRNG, not Math.random()", async () => {
    const src = await read(path.join("services", "apikey.service.ts"));
    // The key-generation statement must draw from the CSPRNG.
    expect(src).toMatch(/const key = `ak_\$\{randomBytes\(/);
    expect(src).not.toMatch(/const key = `ak_\$\{Math\.random/);
  });

  it("invoice numbers use the CSPRNG, not Math.random()", async () => {
    const src = await read(path.join("services", "billing.service.ts"));
    // The random segment of an invoice number must come from the CSPRNG.
    expect(src).toMatch(/randomBytes\(4\)/);
    expect(src).not.toMatch(/Math\.floor\(Math\.random/);
  });

  it("observability trace/span ids use the CSPRNG, not Math.random()", async () => {
    const src = await read(path.join("http", "middleware", "observability.ts"));
    expect(src).toMatch(/randomBytes\(Math\.ceil\(n \/ 2\)\)/);
    expect(src).not.toMatch(/Math\.floor\(Math\.random/);
  });

  it("the in-memory DB fallback is gated and never allowed in production", async () => {
    const src = await read(path.join("db", "client.ts"));
    expect(src).toMatch(/WINDELS_ALLOW_MOCK_DB_FALLBACK/);
    // Production must fail closed, not fall back to the demo in-memory DB.
    expect(src).toMatch(/env\.NODE_ENV === "production" \|\| !allowMock/);
  });

  it("WINDELS_ALLOW_MOCK_DB_FALLBACK defaults to off in the env schema", async () => {
    const src = await read(path.join("config", "env.ts"));
    expect(src).toMatch(/WINDELS_ALLOW_MOCK_DB_FALLBACK/);
    expect(src).toMatch(/\.default\(false\)/);
  });
});
