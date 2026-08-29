import { OpexService } from "./opex.service.js";
export async function bootstrapOpex({ logger, defaultOrgId: oid }: any) { await OpexService.ensureBootstrapped(logger, oid); }
