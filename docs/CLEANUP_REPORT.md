# Cleanup report — production-readiness pass

This pass integrated announcement, SEO, visitor chat, dual SMTP, and site
administration into the existing WINDELS monorepo. It did **not** flatten or
relocate the 100+ session modules (that would break dynamic imports, tests,
and deployment).

## REMOVED
- None. No file was deleted; each candidate is referenced dynamically (routes,
  Prisma, workers, or session bootstraps).

## MOVED / RE-HOMED
- `AnnouncementBar` remains in `components/ui` but now lives in `PublicShell`
  (public website + auth) instead of `main.tsx`, so it no longer covers the
  signed-in app chrome.
- New site platform code is grouped under:
  - `apps/api/src/sitePlatform/`
  - `apps/web/src/components/site/`
  - `apps/web/src/lib/sitePlatform.ts`

## KEPT (look unused, required dynamically)
- Session modules under `apps/api/src/*` and `apps/web/src/pages/*`
- `apps/web/src/components/ui/*` (shared design system)
- Brand assets in `apps/web/public/brand`, `/avatars`, `/reviews` (referenced
  by marketing pages; reviews are labelled illustrative)

## DUPLICATES REVIEWED
- Contact AI assistant (`contact/aiAssistant.ts`) stays for support intake.
  Visitor chat (`sitePlatform`) is the public-site navigator and shares the
  same `aiRegistry` — it is not a second model stack.
- Email Intel SMTP client remains the wire protocol. `EmailService` is the
  single application sender (auth reset + contact + test).

## SUPER ADMIN CONTROL (follow-up)
- Public brand, page copy, reviews, contact map, image slots, and platform API
  credentials are stored under `sp:brand`, `sp:content`, `sp:reviews`, `sp:map`,
  `sp:images`, `sp:apis`, `sp:media:*` (platform_global).
- Super Admin dashboard (`/platform` and `/platform/site`) is the editor.
  Developer marketplace products stay at `/admin/api-platform`.
- No session modules were flattened or deleted.

## GitHub connector + system PIN (follow-up)

- User GitHub connect lives at `/api/v1/github` and `/app/github`.
  Keys: `ghc:conn:<org>:<userId>`, `ghc:idx:<org>`, `ghc:state:<nonce>`.
- 4-digit PINs are generated and rotated by the server after 24 hours.
  One-time reveal is `pinreveal:<userId>` (never persisted on the User row).
- Existing AI Engineering GitHub PAT connections are unchanged.

## SMTP + visitor chat streaming (follow-up)

- SMTP: From display name, Date/Message-ID, STARTTLS on 587, AUTH LOGIN
  fallback after failed PLAIN. Password-reset `smtpConfigured` reads the
  dashboard provider, not only `WINDELS_SMTP_HOST`.
- Visitor chat: `POST /site/chat/stream` emits SSE tokens from
  `aiRegistry.guardedStream` when a real model is configured. Unconfigured
  deployments still answer from site knowledge and label `UNCONFIGURED`.

## Voice TTS honesty + Language B2 (follow-up)

- Voice Studio no longer writes a 440 Hz placeholder WAV. Server synthesis
  without OPENAI_API_KEY / ELEVENLABS_API_KEY / PLAYHT_* / espeak-ng fails
  with `VOICE_MODEL_NOT_CONFIGURED` and no `audioUrl` or invented duration.
- Built-in `win-*` / `bv-*` voices stay client-side SpeechSynthesis.
- Language packs now include authored B2 workplace vocab, grammar, writing
  and BUSINESS conversation. Catalog reports `curriculumCeiling: B2`.
  Pronunciation remains `NOT_AVAILABLE`.
