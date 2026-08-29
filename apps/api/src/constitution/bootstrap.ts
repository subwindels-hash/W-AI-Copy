import ConstitutionService from "./constitution.service.js";
export async function bootstrapConstitution(opts: { logger: any; defaultOrgId?: string; defaultUserId?: string }) {
  await ConstitutionService.ensureBootstrapped(opts.logger, opts.defaultOrgId, opts.defaultUserId);
}
