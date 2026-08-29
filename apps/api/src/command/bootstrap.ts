import { CommandService } from "./command.service.js";
export async function bootstrapCommand({ logger, defaultOrgId: oid }: any) { await CommandService.ensureBootstrapped(logger, oid); }
