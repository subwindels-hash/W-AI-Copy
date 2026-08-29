-- Six-digit public User ID, unique username, hashed rotating PIN.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "publicUserId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pinHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pinSetAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pinExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailPending" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_publicUserId_key" ON "User"("publicUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User"("username");
