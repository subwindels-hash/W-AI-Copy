# Telegram Bot Channel Integration

Telegram is a **channel/interface** into the existing WINDELS AI OS — not a
separate AI. Messages flow: Telegram → webhook (secret verified) → queue →
the existing AI brain (`aiRegistry`), conversation system, memory, RBAC,
billing and agents → delivery worker → Telegram.

## Architecture (`apps/api/src/channels/telegram/`)

| File | Role |
| --- | --- |
| `telegramClient.ts` | Real Telegram Bot API client (getMe, setWebhook, sendMessage, sendChatAction, getFile/download). Throws `TELEGRAM_CONFIGURATION_REQUIRED` when no token — never fakes delivery. |
| `telegramConfig.ts` | AES-256-GCM encryption/decryption of the bot token and webhook secret via the existing `security/encryption`. |
| `telegramChannel.service.ts` | Setup/getMe + setWebhook, disconnect, settings, secret rotation, stats. |
| `telegramWebhook.routes.ts` | Public `POST /api/v1/channels/telegram/webhook`. Constant-time `X-Telegram-Bot-Api-Secret-Token` check, idempotency on `update_id`, fast ACK; enqueues. |
| `telegramIdentity.service.ts` | Secure account linking: cryptographically random, single-use, 10-minute `/start <token>`; immutable Telegram user id (never username); unlinking. |
| `telegramQueue.ts` | Redis LIST + inflight TTL + DLQ worker queue (same idiom as WhatsApp/media). |
| `telegramWorker.ts` | Drains the queue and runs the pipeline out-of-band. |
| `telegramPipeline.ts` | Delegates to existing systems: resolves identity, persists into the real `Conversation`/`Message`, runs commands, enforces gating/RBAC, calls `aiRegistry.complete`, meters usage, delivers replies. |
| `telegramMedia.ts` | Downloads images/docs/audio/video with type/size limits and feeds them to the same multimodal AI / file pipeline. |
| `telegramCommands.ts` | `/start`, `/help`, `/status`, `/newchat`, `/usage`, `/billing`, `/agents`, `/workflows`, etc. |
| `telegramOutbound.ts` | Sends text/documents and records outbound messages. |
| `telegram.routes.ts` | Authenticated management API (setup, disconnect, link-token, connections, stats). |

## Security
- Webhook requests are unauthenticated by JWT (Telegram can't present one);
  trust is established by the per-channel secret header in constant time.
- An unverified Telegram user is a **channel identity only**: no account,
  billing or private data until they complete the secure `/start` link.
- Tenant isolation, rate limiting (`webhookIngest`), idempotency on
  `update_id`, encrypted secrets, audit logging, and RBAC are all enforced.
- The bot token is never returned by the API; only a `configured` flag is.

## Setup
1. Create a bot with @BotFather, copy the token.
2. In WINDELS → Settings → Channels → Telegram, paste the token and Connect.
   WINDELS calls `getMe`, sets the webhook with a random secret, and encrypts
   the token.
3. In WINDELS choose **Connect Telegram** to generate a linking link, open it,
   press START. The immutable Telegram id is bound to your WINDELS user.

## Frontend
Settings → Channels → Telegram (`apps/web/src/pages/settings/TelegramChannelPanel.tsx`)
shows bot status, traffic stats, connect/disconnect, webhook rotation and
secure account-linking deep links, using the existing design system.

## Tests
`telegram.test.ts` covers webhook secret verification, command parsing, secure
single-use linking, outbound config errors, and pipeline delegation (AI brain
stubbed to verify delegation, not generation). The full API suite is green.
