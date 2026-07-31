import { EducationService } from "./education.service.js";
export async function bootstrapEducation({ logger, defaultOrgId: oid = "org-windels", defaultUserId: uid = "user-admin" }: any = {}) {
  try { await EducationService.ensureBootstrapped(logger, oid, uid); }
  catch(e){ logger?.error?.("[education] bootstrap failed",{err:e instanceof Error?e.message:e}); }
}
