import DeploymentService from "./deployment.service.js";
export async function bootstrapDeployment(opts: { logger: any; defaultOrgId?: string }) {
  await DeploymentService.ensureBootstrapped(opts.logger, opts.defaultOrgId);
}
