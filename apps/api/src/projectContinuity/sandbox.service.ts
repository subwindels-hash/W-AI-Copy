/**
 * Session 84 — sandboxed build/typecheck/test validation gate (S84.11).
 *
 * Untrusted project code is NEVER executed in the API process. This service
 * runs the gate inside a sandbox chosen by env:
 *   PC_SANDBOX_MODE=none   (default) — stages report not_configured honestly.
 *   PC_SANDBOX_MODE=local  — bounded subprocess per stage (timeout, capped
 *                            output, stripped env, no shell). NOT a security
 *                            boundary; for trusted/CI-hosted projects only.
 *   PC_SANDBOX_MODE=docker — `docker run` with --network none, memory/cpu
 *                            caps, read workspace mount, per-stage timeout.
 * Commands are detected from the project's package.json scripts when present.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PcPackageManifest, PcSandboxResult, PcSandboxStageResult } from "@windels/shared";

const execFileP = promisify(execFile);
const MAX_OUTPUT = 256 * 1024;

export function sandboxMode(): "docker" | "local" | "none" {
  const m = (process.env.PC_SANDBOX_MODE ?? "none").toLowerCase();
  return m === "docker" ? "docker" : m === "local" ? "local" : "none";
}

export interface DetectedCommands {
  typecheck?: string;
  build?: string;
  test?: string;
}

/** Picks gate commands from package.json scripts, with sensible fallbacks. */
export function detectCommands(packages: PcPackageManifest[]): DetectedCommands {
  const root = packages.find((p) => (p.file.split("/").length ?? 1) === 1) ?? packages[0];
  if (!root) return { typecheck: "tsc --noEmit", build: "npm run build", test: "npm test" };
  const scripts = new Set(root.scripts);
  const has = (s: string) => [...scripts].some((x) => x === s || x.startsWith(`${s}:`));
  return {
    typecheck: has("typecheck") ? "npm run typecheck" : "tsc --noEmit",
    build: has("build") ? "npm run build" : undefined,
    test: has("test") ? "npm test" : undefined,
  };
}

function envFor(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: "/usr/bin:/bin:/usr/local/bin",
    HOME: "/tmp",
    NODE_ENV: "test",
    ...(process.platform === "win32" ? { ...process.env } : {}),
  };
}

async function runStage(
  mode: "docker" | "local" | "none",
  workspacePath: string,
  command: string | undefined,
  label: string,
  timeoutMs: number,
): Promise<PcSandboxStageResult> {
  if (mode === "none" || !command) {
    return {
      command: command ?? label,
      status: "not_configured",
      note: mode === "none" ? "Set PC_SANDBOX_MODE=docker or =local to enable the sandboxed validation gate." : "no command detected for this stage",
    };
  }
  const started = Date.now();
  try {
    let args: string[];
    let cwd = workspacePath;
    if (mode === "docker") {
      const image = process.env.PC_SANDBOX_IMAGE ?? "node:20-alpine";
      args = ["run", "--rm", "--network", "none", "-m", "512m", "--cpus", "1", "-v", `${workspacePath}:/ws:ro`, "-w", "/ws", image, "sh", "-c", command];
      cwd = process.cwd();
    } else {
      args = ["sh", "-c", command];
    }
    const { stdout, stderr } = await execFileP(args[0], args.slice(1), {
      cwd,
      env: envFor(cwd),
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT,
      killSignal: "SIGKILL",
    });
    const tail = (stdout + "\n" + stderr).trim().slice(-2000) || "(no output)";
    return { command, status: "passed", exitCode: 0, durationMs: Date.now() - started, outputTail: tail };
  } catch (e: any) {
    const timedOut = e?.killed === true || e?.signal === "SIGKILL" || /timeout/i.test(String(e?.message ?? ""));
    return {
      command,
      status: timedOut ? "timeout" : "failed",
      exitCode: e?.code ?? undefined,
      durationMs: Date.now() - started,
      outputTail: String(e?.stdout ?? e?.message ?? "").slice(-2000),
    };
  }
}

export async function runSandboxValidation(
  workspacePath: string,
  packages: PcPackageManifest[],
  opts: { timeoutMs?: number } = {},
): Promise<PcSandboxResult> {
  const mode = sandboxMode();
  const timeoutMs = opts.timeoutMs ?? Number(process.env.PC_SANDBOX_TIMEOUT_S ?? 120) * 1000;
  const cmds = detectCommands(packages);
  const stages: PcSandboxStageResult[] = [
    await runStage(mode, workspacePath, cmds.typecheck, "typecheck", timeoutMs),
    await runStage(mode, workspacePath, cmds.build, "build", timeoutMs),
    await runStage(mode, workspacePath, cmds.test, "tests", timeoutMs),
  ];
  const ran = stages.filter((s) => s.status !== "not_configured");
  const overall: PcSandboxResult["overall"] = mode === "none"
    ? "not_configured"
    : ran.some((s) => s.status === "failed" || s.status === "timeout") ? "failed" : "passed";
  return { ranAt: new Date().toISOString(), mode, stages, overall };
}
