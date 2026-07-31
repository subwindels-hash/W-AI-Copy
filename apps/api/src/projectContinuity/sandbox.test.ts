/**
 * Sandbox validation gate — command detection + mode behavior.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectCommands, runSandboxValidation, sandboxMode } from "./sandbox.service.js";
import type { PcPackageManifest } from "@windels/shared";

afterEach(() => { delete process.env.PC_SANDBOX_MODE; delete process.env.PC_SANDBOX_IMAGE; delete process.env.PC_SANDBOX_TIMEOUT_S; });

const pkg = (scripts: string[], deps: string[] = []): PcPackageManifest => ({
  file: "package.json", name: "demo", scripts, dependencies: deps,
});

describe("detectCommands", () => {
  it("prefers declared scripts and falls back to tsc", () => {
    const cmds = detectCommands([pkg(["typecheck", "build", "test"])]);
    expect(cmds.typecheck).toBe("npm run typecheck");
    expect(cmds.build).toBe("npm run build");
    expect(cmds.test).toBe("npm test");
  });
  it("falls back to tsc --noEmit when no typecheck script exists", () => {
    expect(detectCommands([pkg(["build"])]).typecheck).toBe("tsc --noEmit");
  });
  it("handles monorepo roots (first manifest) and empty manifests", () => {
    expect(detectCommands([]).typecheck).toBe("tsc --noEmit");
    const mono = detectCommands([
      { file: "packages/web/package.json", name: "web", scripts: ["dev"], dependencies: [] },
      { file: "package.json", name: "root", scripts: ["build"], dependencies: [] },
    ]);
    expect(mono.build).toBe("npm run build");
  });
});

describe("runSandboxValidation", () => {
  it("mode none reports not_configured honestly (never executes)", async () => {
    process.env.PC_SANDBOX_MODE = "none";
    const r = await runSandboxValidation("/tmp/nowhere", [pkg(["build"])]);
    expect(r.mode).toBe("none");
    expect(r.overall).toBe("not_configured");
    expect(r.stages.every((s) => s.status === "not_configured")).toBe(true);
  });

  it("mode local executes declared commands in a bounded subprocess", async () => {
    process.env.PC_SANDBOX_MODE = "local";
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "windels-sbx-"));
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({
      scripts: {
        typecheck: "node -e \"process.exit(0)\"",
        build: "node -e \"process.exit(0)\"",
        test: "node -e \"process.exit(1)\"",
      },
    }));
    try {
      const r = await runSandboxValidation(dir, [pkg(["build", "typecheck", "test"], ["express"])]);
      expect(r.mode).toBe("local");
      expect(r.stages.length).toBe(3);
      const typecheck = r.stages.find((s) => s.command.includes("typecheck"));
      const build = r.stages.find((s) => s.command.includes("build"));
      const tests = r.stages.find((s) => s.command.includes("test"));
      expect(typecheck?.status).toBe("passed");
      expect(build?.status).toBe("passed");
      expect(tests?.status).toBe("failed"); // exit 1 → failed
      expect(r.overall).toBe("failed");
      expect(build?.durationMs).toBeGreaterThan(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("sandboxMode parses env", () => {
    process.env.PC_SANDBOX_MODE = "DOCKER";
    expect(sandboxMode()).toBe("docker");
    delete process.env.PC_SANDBOX_MODE;
    expect(sandboxMode()).toBe("none");
  });
});
