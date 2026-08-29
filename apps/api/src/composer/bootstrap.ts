import ComposerService from "./composer.service.js";
export async function bootstrapComposer(opts: { logger: any; defaultOrgId?: string; defaultUserId?: string }) {
  await ComposerService.ensureBootstrapped(opts.logger, opts.defaultOrgId, opts.defaultUserId);
}
