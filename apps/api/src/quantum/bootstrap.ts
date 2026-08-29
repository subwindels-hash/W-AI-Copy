import { QuantumService } from "./quantum.service.js";
export async function bootstrapQuantum({ logger, defaultOrgId: oid = "org-windels" }: any = {}) {
  try { await QuantumService.ensureBootstrapped(logger, oid); }
  catch (e) { logger?.error?.("[quantum] bootstrap failed", { err: e instanceof Error ? e.message : e }); }
}
