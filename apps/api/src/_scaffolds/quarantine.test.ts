/**
 * S212 — enforce the quarantine.
 *
 * `apps/api/src/services/` held 304 `*.service.ts` files of which 263 (94%)
 * were imported by nothing. That ratio made the directory unreadable: the 41
 * real services were a rounding error inside a pile of generated drafts. The
 * drafts now live in `_scaffolds/`.
 *
 * The quarantine is only worth anything if it holds, so this test fails if
 * reachable code ever imports from it, and if the neutralized security
 * scaffolds ever lose their guards.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SCAFFOLDS = join(SRC, "_scaffolds");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p, out); }
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("scaffold quarantine", () => {
  it("no reachable source file imports from _scaffolds", () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      if (f.startsWith(SCAFFOLDS)) continue;
      const src = readFileSync(f, "utf8");
      if (/["'][^"']*_scaffolds\//.test(src)) offenders.push(relative(SRC, f));
    }
    // Importing a scaffold silently pulls unreviewed, never-executed code --
    // including the fabricated data and the neutralized security checks --
    // into the running product.
    expect(offenders).toEqual([]);
  });

  it("the compliance scanner cannot silently report zero violations", () => {
    const p = join(SCAFFOLDS, "services/automatedComplianceScanning.service.ts");
    const src = readFileSync(p, "utf8");
    // Four checks used to `return violations` on an array nothing pushed to,
    // making the scanner always report "compliant".
    for (const fn of ["checkPIIInLogs", "checkEncryptionAtRest", "checkDataExport", "checkDataErasure"]) {
      const body = src.slice(src.indexOf(`async function ${fn}(`));
      expect(body.slice(0, 600), `${fn} lost its guard`).toContain("scaffoldNotImplemented(");
    }
  });

  it("model packaging cannot claim a signature, verification or checksum it does not have", () => {
    const src = readFileSync(join(SCAFFOLDS, "services/modelPackaging.service.ts"), "utf8");
    expect(src).toContain("SIGNING_NOT_IMPLEMENTED");     // was sha256(checksum + privateKey)
    expect(src).toContain("PACKAGE VERIFICATION NOT IMPLEMENTED"); // hashed the caller's public key
    expect(src).toContain("CHECKSUM_NOT_IMPLEMENTED");    // hashed the URL string, not the file
  });

  it("keeps the two scaffolds that reachable code still depends on out of quarantine", () => {
    // automatedBackup <- src/qa/drTest.service.ts
    // rowLevelSecurity <- src/index.ts, http/middleware/tenantContext.ts
    // serviceToServiceAuth <- src/services/serviceToServiceAuth.test.ts
    for (const f of ["automatedBackup", "rowLevelSecurity", "serviceToServiceAuth"]) {
      expect(existsSync(join(SRC, `services/${f}.service.ts`)), `${f} must stay reachable`).toBe(true);
      expect(existsSync(join(SCAFFOLDS, `services/${f}.service.ts`)), `${f} must not be quarantined`).toBe(false);
    }
  });

  it("documents the quarantine", () => {
    expect(existsSync(join(SCAFFOLDS, "README.md"))).toBe(true);
  });
});
