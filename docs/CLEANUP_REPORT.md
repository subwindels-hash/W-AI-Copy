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
