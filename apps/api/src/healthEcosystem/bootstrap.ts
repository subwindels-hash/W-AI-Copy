import { HealthEcosystemService } from "./healthEcosystem.service.js";
export async function bootstrapHealthEcosystem({ logger, defaultOrgId: oid }: any) { await HealthEcosystemService.ensureBootstrapped(logger, oid); }
