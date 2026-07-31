import { IndustryService } from "./industry.service.js";
export async function bootstrapIndustry({ logger, defaultOrgId: oid }: any) { await IndustryService.ensureBootstrapped(logger, oid); }
