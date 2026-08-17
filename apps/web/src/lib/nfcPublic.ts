/** Session 181 — nfcPublic web client alias
 * Re-exports the internal NFC client. The public surface is the same
 * capability-aware NFC Card Manager (React web/mobile/desktop + Electron
 * PC/SC bridge) exposed via API-key scopes for external use.
 */
export * from "./nfc";
import * as nfc from "./nfc";
export const nfcPublicApi = (nfc as any).nfcApi ?? (nfc as any).default ?? nfc;
