import { AiEconomyService } from "./aiEconomy.service.js";
export async function bootstrapAiEconomy({ logger, defaultOrgId: oid }: any) { await AiEconomyService.ensureBootstrapped(logger, oid); }
