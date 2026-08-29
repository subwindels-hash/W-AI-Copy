import LicensingService from "./licensing.service.js";
export async function bootstrapLicensing(opts: { logger: any; defaultOrgId?: string; defaultUserId?: string }) {
  await LicensingService.ensureBootstrapped(opts.logger, opts.defaultOrgId, opts.defaultUserId);
}
