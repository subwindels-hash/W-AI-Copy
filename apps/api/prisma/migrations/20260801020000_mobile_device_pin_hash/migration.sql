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

ALTER TABLE "MobileDevice" ADD COLUMN "pinHash" TEXT;

-- Carry over any existing PIN hashes, identified by the bcrypt prefix, so
-- devices that already set a PIN keep working after deploy.
UPDATE "MobileDevice"
SET "pinHash" = "deviceModel"
WHERE "deviceModel" ~ '^\$2[aby]\$';

-- Clear the smuggled secret from the client-writable column.
UPDATE "MobileDevice"
SET "deviceModel" = NULL
WHERE "deviceModel" ~ '^\$2[aby]\$';
