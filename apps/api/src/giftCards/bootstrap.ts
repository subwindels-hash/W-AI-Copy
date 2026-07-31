import { GiftCardsService as Gc } from "./giftCards.service.js";
export async function bootstrapGiftCards(logger?: any) {
  if ((await Gc.dashboard()).issued > 0) { logger?.info("[gift-cards] bootstrap skipped"); return; }
  await Gc.ensureBootstrapped(logger);
  const desc = Gc.paymentMethodDescriptor();
  logger?.info("[gift-cards] bootstrap complete", { cards: 5, loyalty: 1, paymentMethod: desc.id });
}
