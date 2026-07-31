import { ScientificService } from "./scientific.service.js";
export async function bootstrapScientific({ logger, defaultOrgId: oid }: any) {
  await ScientificService.ensureBootstrapped(logger, oid);
}
