import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for @windels/api.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/config/env.ts` validates the process environment at *import* time and
 * calls `process.exit(1)` when required variables are missing. That is correct
 * behaviour for a server — it must refuse to boot half-configured — but it also
 * means that any test whose import graph reaches `config/env.ts` (directly, or
 * transitively via `db/redis.ts`, `security/encryption.ts`, `config/demoData.ts`,
 * …) dies during collection on a machine that has no `.env`.
 *
 * On a fresh clone that was 21 of 44 test files: they failed with
 * "process.exit unexpectedly called with 1" before a single assertion ran. The
 * suite only looked green on a developer box that happened to have a local
 * `.env` exporting DATABASE_URL / REDIS_URL / JWT_SECRET.
 *
 * The fix belongs here rather than in `env.ts`:
 *
 *   - Relaxing the schema (making DATABASE_URL optional, or skipping validation
 *     when NODE_ENV=test) would weaken a real production guard, and
 *     `config/demoData.test.ts` explicitly asserts that an invalid value still
 *     triggers `process.exit(1)`. That test must keep passing.
 *   - Committing a `.env` is not an option (secrets, and it is gitignored).
 *
 * So the test runner supplies the minimum viable configuration instead. These
 * values are deliberately non-functional placeholders: every suite that touches
 * Redis or Prisma already substitutes `vi.mock("ioredis")`, the `FakeKv` helper,
 * or `testUtils/fakePrisma.ts`, so nothing here is ever dialled. The URLs exist
 * only to satisfy the Zod schema.
 *
 * Real integration suites (`chat-e2e`, `core-platform`, `ai-runtime`) probe for
 * a live server via `testUtils/liveApi.ts` and self-skip when it is absent, so
 * these placeholders do not cause them to run against a phantom database.
 */
export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      // Never connected to — see the note above. Any suite exercising the DB
      // uses testUtils/fakePrisma.ts.
      DATABASE_URL: "postgresql://windels:windels@127.0.0.1:5432/windels_test?schema=public",
      // Never connected to — suites mock `ioredis` / `db/redis.js`.
      REDIS_URL: "redis://127.0.0.1:6379",
      // Satisfies the 16-char minimum. Not a real secret and not used to sign
      // anything that leaves the test process.
      JWT_SECRET: "windels-test-jwt-secret-not-a-real-secret",
      // 64 hex chars, as AES-256-GCM requires. Deterministic so encryption
      // round-trip tests are reproducible.
      WINDELS_ENCRYPTION_KEY:
        "0000000000000000000000000000000000000000000000000000000000000001",
      // The synthetic-seed gate must stay off by default; `config/demoData.test.ts`
      // and `config/seedGate.test.ts` assert exactly that.
      WINDELS_DEMO_DATA: "false",
      // Keep test output readable — pino would otherwise emit a JSON line per
      // bootstrap warning.
      LOG_LEVEL: "fatal",
    },
  },
});
