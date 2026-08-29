import { GlobalCurrencyService as Gcu } from "./globalCurrency.service.js";
export async function bootstrapGlobalCurrency(logger?: any) {
  if ((await Gcu.dashboard()).currenciesSupported > 0) { logger?.info("[global-currency] bootstrap skipped"); return; }
  await Gcu.ensureBootstrapped(logger);
  logger?.info("[global-currency] bootstrap complete", { currencies: 10, languages: 12, countries: 10, agents: 3 });
}
