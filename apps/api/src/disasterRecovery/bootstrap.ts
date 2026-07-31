import DisasterRecoveryService from "./disasterRecovery.service.js";
export async function bootstrapDisasterRecovery(opts: { logger: any; defaultOrgId?: string }) {
  await DisasterRecoveryService.ensureBootstrapped(opts.logger, opts.defaultOrgId);
}
