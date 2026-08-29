import { AutonomousService } from "./autonomous.service.js";
export async function bootstrapAutonomous({ logger, defaultOrgId: oid }: any) { await AutonomousService.ensureBootstrapped(logger, oid); }
