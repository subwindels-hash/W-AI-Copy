import { BiomedicalService } from "./biomedical.service.js";
export async function bootstrapBiomedical({ logger, defaultOrgId: oid, defaultUserId: uid }: any = {}) {
  try { await BiomedicalService.ensureBootstrapped(logger, oid, uid); }
  catch(e){ logger?.error?.("[biomedical] bootstrap failed",{err:e instanceof Error?e.message:e}); }
}
