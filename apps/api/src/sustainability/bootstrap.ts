import { SustainabilityService } from "./sustainability.service.js";
export async function bootstrapSustainability({ logger, defaultOrgId: oid = "org-windels" }: any = {}) {
  try { await SustainabilityService.ensureBootstrapped(logger, oid); }
  catch(e){ logger?.error?.("[sustainability] bootstrap failed",{err:e instanceof Error?e.message:e}); }
}
