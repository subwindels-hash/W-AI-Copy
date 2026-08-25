CREATE TABLE IF NOT EXISTS "lottery_draws" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lotteryId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerDrawId" TEXT NOT NULL,
    "drawDate" TIMESTAMP(3) NOT NULL,
    "mainNumbers" INTEGER[],
    "bonusNumbers" INTEGER[],
    "dataClass" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "validationStatus" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lottery_draws_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lottery_draws_org_lottery_provider_draw_key"
  ON "lottery_draws"("organizationId", "lotteryId", "providerId", "providerDrawId");
CREATE INDEX IF NOT EXISTS "lottery_draws_organizationId_drawDate_idx" ON "lottery_draws"("organizationId", "drawDate");
CREATE INDEX IF NOT EXISTS "lottery_draws_lotteryId_drawDate_idx" ON "lottery_draws"("lotteryId", "drawDate");

CREATE TABLE IF NOT EXISTS "lottery_tickets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lotteryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dataClass" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lottery_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lottery_tickets_organizationId_userId_createdAt_idx"
  ON "lottery_tickets"("organizationId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "lottery_tickets_lotteryId_idx" ON "lottery_tickets"("lotteryId");

CREATE TABLE IF NOT EXISTS "lottery_backtests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "dataClass" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lottery_backtests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lottery_backtests_organizationId_createdAt_idx"
  ON "lottery_backtests"("organizationId", "createdAt");
