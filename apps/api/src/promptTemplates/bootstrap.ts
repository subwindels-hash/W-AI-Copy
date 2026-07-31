import { seedBuiltInTemplates } from "./promptTemplates.service.js";

/**
 * Seed the built-in prompt library for the default organization.
 *
 * The service already seeds lazily on first list(), but that means the very
 * first user to open the library pays for it and an org that is provisioned but
 * never browsed has none. Seeding at boot makes the built-ins present from the
 * start, and seedBuiltInTemplates() is idempotent (it no-ops when built-ins
 * already exist), so repeated boots do not duplicate them.
 */
export async function bootstrapPromptTemplates({ logger, defaultOrgId, defaultUserId }: any) {
  if (!defaultOrgId || !defaultUserId) return;
  try {
    await seedBuiltInTemplates(defaultOrgId, defaultUserId);
    logger?.info?.("[prompt-templates] built-in library ready");
  } catch (err) {
    // Never let template seeding block API startup.
    logger?.warn?.("[prompt-templates] bootstrap skipped", { err: (err as Error)?.message });
  }
}
