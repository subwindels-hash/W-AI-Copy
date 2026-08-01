/**
 * Helper for the integration suites that require a live API server.
 *
 * chat-e2e / ai-runtime / core-platform talk to a running instance on
 * localhost:4000. When no server is up (unit-test runs, CI without infra) the
 * suites should be *skipped*, not reported as failures — previously the
 * `beforeAll` login threw ECONNREFUSED and vitest marked the whole file failed
 * even though every test inside was correctly skipped.
 *
 * Usage:
 *   const live = await isApiLive();
 *   describe.skipIf(!live)("...", () => { ... });
 */

export const API_BASE = process.env.TEST_API_URL ?? "http://localhost:4000/api/v1";

/** Probe the API health endpoint. Resolves false when nothing is listening. */
export async function isApiLive(timeoutMs = 1500): Promise<boolean> {
  const url = new URL(API_BASE);
  const health = `${url.protocol}//${url.host}/healthz`;
  try {
    const res = await fetch(health, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}
