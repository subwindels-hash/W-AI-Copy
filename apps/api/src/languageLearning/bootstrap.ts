import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

/**
 * Language Learning bootstrap.
 * Curriculum is static and always available. No demo learner profiles are
 * created unless WINDELS_DEMO_DATA is on — empty progress must stay empty.
 */
export async function bootstrapLanguageLearning(logger?: { info?: Function; warn?: Function }) {
  if (!demoDataEnabled()) return skipDemoSeed("language-learning", logger as any);
  logger?.info?.("[language-learning] demo flag on — curriculum stays static; no fake learner progress is seeded");
}
