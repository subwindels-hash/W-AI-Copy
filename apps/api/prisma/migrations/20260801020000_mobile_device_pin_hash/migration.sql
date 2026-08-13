-- Move the mobile PIN fallback hash out of "deviceModel" into its own column.
--
-- WHY
-- ---
-- setPin() stored its bcrypt hash in MobileDevice."deviceModel". That column is
-- written directly from the POST /api/v1/mobile/devices/register request body
-- (`deviceModel: z.string().max(64)`), and a bcrypt hash is exactly 60
-- characters — comfortably inside the limit. A caller could therefore overwrite
-- the stored hash with the hash of a PIN they chose and then pass the PIN
-- check, or clobber another device's PIN by re-registering its id.
--
-- "pinHash" is never accepted from a request body and never returned by
-- listDevices().

-- SELF-CONTAINED GUARD
-- --------------------
-- "MobileDevice" was only ever created by a hand-applied patch outside
-- prisma/migrations, so on a clean database (CI, staging, a fresh prod) this
-- migration used to abort with: relation "MobileDevice" does not exist —
-- breaking every from-scratch deploy. The table is now created by the
-- 20260813000000_schema_drift_baseline migration that follows this one, with
-- "pinHash" already in place, so on a clean database this migration correctly
-- has nothing to do. It still performs the real backfill on any existing
-- database where the table was patched in ahead of the ledger.
DO $$
BEGIN
  IF to_regclass('public."MobileDevice"') IS NULL THEN
    RAISE NOTICE 'MobileDevice does not exist yet; pinHash is created with the table in a later migration. Skipping.';
    RETURN;
  END IF;

  ALTER TABLE "MobileDevice" ADD COLUMN IF NOT EXISTS "pinHash" TEXT;

  -- Carry over any existing PIN hashes, identified by the bcrypt prefix, so
  -- devices that already set a PIN keep working after deploy.
  UPDATE "MobileDevice"
  SET "pinHash" = "deviceModel"
  WHERE "deviceModel" ~ '^\$2[aby]\$';

  -- Clear the smuggled secret from the client-writable column.
  UPDATE "MobileDevice"
  SET "deviceModel" = NULL
  WHERE "deviceModel" ~ '^\$2[aby]\$';
END $$;
