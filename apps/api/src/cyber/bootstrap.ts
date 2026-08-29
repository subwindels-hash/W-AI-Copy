import { CyberService } from "./cyber.service.js";
export async function bootstrapCyber({ logger, defaultOrgId: oid }: any) { await CyberService.ensureBootstrapped(logger, oid); }
