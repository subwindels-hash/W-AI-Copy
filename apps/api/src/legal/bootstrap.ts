import { LegalService } from "./legal.service.js";
export async function bootstrapLegal({ logger, defaultOrgId: oid = "org-windels", defaultUserId: uid = "user-admin" }: any = {}) {
  try { await LegalService.ensureBootstrapped(logger, oid, uid); }
  catch(e){ logger?.error?.("[legal] bootstrap failed",{err:e instanceof Error?e.message:e}); }
}
