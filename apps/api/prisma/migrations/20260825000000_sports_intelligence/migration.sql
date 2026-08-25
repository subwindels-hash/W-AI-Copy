-- WINDELS Sports Intelligence durable historical store.
-- Operational reads/writes remain on the org-scoped Redis ledger (si:*).

CREATE TABLE IF NOT EXISTS "sports_matches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerMatchId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueName" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "dataClass" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sports_matches_organizationId_providerId_providerMatchId_key"
  ON "sports_matches"("organizationId", "providerId", "providerMatchId");
CREATE INDEX IF NOT EXISTS "sports_matches_organizationId_kickoffAt_idx" ON "sports_matches"("organizationId", "kickoffAt");
CREATE INDEX IF NOT EXISTS "sports_matches_leagueId_idx" ON "sports_matches"("leagueId");
CREATE INDEX IF NOT EXISTS "sports_matches_status_idx" ON "sports_matches"("status");

CREATE TABLE IF NOT EXISTS "sports_odds" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "oddsDecimal" DOUBLE PRECISION NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "dataClass" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_odds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sports_odds_matchId_idx" ON "sports_odds"("matchId");
CREATE INDEX IF NOT EXISTS "sports_odds_organizationId_observedAt_idx" ON "sports_odds"("organizationId", "observedAt");
CREATE INDEX IF NOT EXISTS "sports_odds_market_selection_idx" ON "sports_odds"("market", "selection");
CREATE INDEX IF NOT EXISTS "sports_odds_providerId_idx" ON "sports_odds"("providerId");

CREATE TABLE IF NOT EXISTS "sports_predictions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "dataClass" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_predictions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sports_predictions_matchId_idx" ON "sports_predictions"("matchId");
CREATE INDEX IF NOT EXISTS "sports_predictions_organizationId_createdAt_idx" ON "sports_predictions"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "sports_predictions_modelVersion_idx" ON "sports_predictions"("modelVersion");

CREATE TABLE IF NOT EXISTS "sports_tickets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "dataClass" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "sports_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sports_tickets_organizationId_ticketCode_key" ON "sports_tickets"("organizationId", "ticketCode");
CREATE INDEX IF NOT EXISTS "sports_tickets_organizationId_createdAt_idx" ON "sports_tickets"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "sports_tickets_status_idx" ON "sports_tickets"("status");

CREATE TABLE IF NOT EXISTS "sports_results" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "dataClass" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sports_results_matchId_idx" ON "sports_results"("matchId");
CREATE INDEX IF NOT EXISTS "sports_results_organizationId_createdAt_idx" ON "sports_results"("organizationId", "createdAt");

CREATE TABLE IF NOT EXISTS "sports_job_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "providerId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "sports_job_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sports_job_runs_organizationId_startedAt_idx" ON "sports_job_runs"("organizationId", "startedAt");
CREATE INDEX IF NOT EXISTS "sports_job_runs_executionId_idx" ON "sports_job_runs"("executionId");
