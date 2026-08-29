import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ModuleManifest, ModuleRunnerResult } from "@windels/shared/moduleCenter";

export type RunnerAction = "SANDBOX_TEST" | "INSTALL" | "ENABLE" | "DISABLE" | "RESTART" | "HEALTH_CHECK" | "ROLLBACK" | "REMOVE";

function runnerConfig(): { url: string; secret: string } | null {
  const url = process.env.MODULE_RUNNER_URL?.trim();
  const secret = process.env.MODULE_RUNNER_HMAC_SECRET?.trim();
  if (!url || !secret || secret.length < 32) return null;
  if (process.env.NODE_ENV === "production" && !url.startsWith("https://")) return null;
  return { url: url.replace(/\/$/, ""), secret };
}
function sanitizeLogs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-200).map((line) => String(line).replace(/(token|secret|password|authorization)\s*[=:]\s*\S+/ig, "$1=[REDACTED]").slice(0, 2000));
}

/** Signed adapter to the isolated WINDELS Module Runner deployment plane. */
export async function runModuleAction(input: {
  action: RunnerAction;
  moduleId: string;
  releaseId: string;
  version: string;
  checksum: string;
  artifactPath: string;
  manifest: ModuleManifest;
  actorId: string;
  correlationId?: string;
  previousVersion?: string;
  previousReleaseId?: string;
}): Promise<ModuleRunnerResult> {
  const config = runnerConfig();
  if (!config) return {
    ok: false, action: input.action, status: "NOT_CONFIGURED",
    checks: [{ code: "MODULE_RUNNER_NOT_CONFIGURED", category: "sandbox", status: "NOT_CONFIGURED", severity: "critical", message: "MODULE_RUNNER_URL and a 32+ character MODULE_RUNNER_HMAC_SECRET are required. Uploaded code remains inactive." }],
    logs: [], evidence: {},
  };
  const correlationId = input.correlationId ?? randomUUID();
  const artifactBase = process.env.MODULE_RUNNER_ARTIFACT_BASE_URL?.replace(/\/$/, "");
  const payload = {
    protocol: "windels-module-runner/v1",
    action: input.action,
    correlationId,
    actor: { id: input.actorId, authority: "super_admin" },
    module: { id: input.moduleId, releaseId: input.releaseId, version: input.version, checksum: input.checksum, manifest: input.manifest },
    artifact: {
      sha256: input.checksum,
      ...(artifactBase ? { uri: `${artifactBase}/${input.releaseId}.wmod` } : { sharedPath: input.artifactPath }),
    },
    previous: { version: input.previousVersion, releaseId: input.previousReleaseId },
    policy: { networkDefault: "deny", readOnlyRoot: true, noNewPrivileges: true, requireHealth: true, requireRollbackOnFailure: true },
  };
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", config.secret).update(`${timestamp}.${body}`).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.MODULE_RUNNER_TIMEOUT_MS ?? 180_000));
  try {
    const response = await fetch(`${config.url}/v1/module-actions`, {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", "x-windels-timestamp": timestamp, "x-windels-signature": `v1=${signature}`, "x-correlation-id": correlationId },
      body,
    });
    const text = await response.text();
    const responseTimestamp = response.headers.get("x-windels-timestamp") ?? "";
    const responseSignature = response.headers.get("x-windels-signature") ?? "";
    if (!verifyRunnerSignature(responseTimestamp, text, responseSignature)) return { ok: false, action: input.action, status: "FAILED", checks: [{ code: "RUNNER_RESPONSE_SIGNATURE_INVALID", category: "sandbox", status: "FAILED", severity: "critical", message: "Module Runner response signature is missing, stale, or invalid." }], logs: [], evidence: {} };
    if (!response.ok) return { ok: false, action: input.action, status: "FAILED", checks: [{ code: "RUNNER_HTTP_ERROR", category: "sandbox", status: "FAILED", severity: "critical", message: `Module Runner returned HTTP ${response.status}.` }], logs: [text.slice(-2000)], evidence: { status: response.status } };
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return { ok: false, action: input.action, status: "FAILED", checks: [{ code: "RUNNER_RESPONSE_INVALID", category: "sandbox", status: "FAILED", severity: "critical", message: "Module Runner returned invalid JSON." }], logs: [], evidence: {} }; }
    if (parsed.action !== input.action || parsed.correlationId !== correlationId) return { ok: false, action: input.action, status: "FAILED", checks: [{ code: "RUNNER_RESPONSE_MISMATCH", category: "sandbox", status: "FAILED", severity: "critical", message: "Runner response action/correlation does not match the request." }], logs: sanitizeLogs(parsed.logs), evidence: {} };
    return {
      ok: parsed.ok === true,
      action: input.action,
      status: parsed.ok === true ? "PASSED" : "FAILED",
      checks: Array.isArray(parsed.checks) ? parsed.checks.slice(0, 200) : [],
      logs: sanitizeLogs(parsed.logs),
      evidence: parsed.evidence && typeof parsed.evidence === "object" ? parsed.evidence : {},
      runtime: parsed.runtime && typeof parsed.runtime === "object" ? { serviceUrl: typeof parsed.runtime.serviceUrl === "string" ? parsed.runtime.serviceUrl : undefined, instanceId: typeof parsed.runtime.instanceId === "string" ? parsed.runtime.instanceId : undefined, imageDigest: typeof parsed.runtime.imageDigest === "string" ? parsed.runtime.imageDigest : undefined } : undefined,
      rollbackPerformed: parsed.rollbackPerformed === true,
    };
  } catch (error) {
    return { ok: false, action: input.action, status: "FAILED", checks: [{ code: error instanceof Error && error.name === "AbortError" ? "RUNNER_TIMEOUT" : "RUNNER_UNAVAILABLE", category: "sandbox", status: "FAILED", severity: "critical", message: error instanceof Error ? error.message : String(error) }], logs: [], evidence: {} };
  } finally { clearTimeout(timeout); }
}

/** Verify runner-signed inbound context if an internal callback is added later. */
export function verifyRunnerSignature(timestamp: string, body: string, provided: string): boolean {
  const config = runnerConfig(); if (!config || !provided.startsWith("v1=")) return false;
  if (Math.abs(Date.now() - Date.parse(timestamp)) > 5 * 60_000) return false;
  const expected = Buffer.from(createHmac("sha256", config.secret).update(`${timestamp}.${body}`).digest("hex"));
  const actual = Buffer.from(provided.slice(3));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
