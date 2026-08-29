import { CognitiveService } from "./cognitive.service.js";
export async function bootstrapCognitive({ logger, defaultOrgId: oid }: any) { await CognitiveService.ensureBootstrapped(logger, oid); }
