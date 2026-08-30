# CodeIgniter 3 / MySQL migration

## Implemented runtime

`php/` contains an unmodified CodeIgniter **3.1.13** framework distribution plus the new application. It provides API-envelope-compatible health, registration, login, rotating refresh tokens, logout, and current-user endpoints. Passwords use PHP's adaptive `password_hash`; access tokens use HS256 and refresh tokens are stored only as SHA-256 hashes.

The React/Vite client remains the primary UI and continues to call `/api/v1`. Start the replacement stack with:

```bash
cp .env.example .env # use a JWT_SECRET of at least 32 random characters
# pnpm install must have been run for the web container
docker compose -f docker-compose.php.yml up --build
```

API: `http://localhost:4000`; web: `http://localhost:5173`.

## Compatibility status

This is the migration foundation, **not a completed 200-module rewrite**. The prior backend has 179 route files, roughly 2,396 route declarations, and 123 Prisma models. Unknown authenticated module routes deliberately return HTTP 501 `MODULE_NOT_MIGRATED`; they never return fabricated data. PostgreSQL is not read directly. Data migration must be performed with an ETL that preserves UUIDs, tenant membership, timestamps, and ledger immutability.

## Porting contract

1. Add each module as a thin CI controller, domain service/library, and one or more models.
2. Preserve `/api/v1` paths and `{ok,data,error,meta}` envelopes.
3. Scope every tenant query by the authenticated `organizationId`; MySQL has no PostgreSQL RLS safety net.
4. Convert Prisma enums to lookup tables or constrained columns and PostgreSQL JSONB to MySQL JSON.
5. Port module tests before enabling its route. Remove the 501 fallback only after parity tests pass.
6. Run financial/payment imports separately with reconciliation and immutable audit records.

The existing Node source remains in place as executable behavior documentation until each endpoint is parity-tested. Removing it now would destroy the only complete specification and make a safe data-compatible rewrite less likely.
