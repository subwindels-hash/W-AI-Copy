-- WINDELS Language Learning archive tables.
-- Operational state lives in org-scoped Redis (`ll:*`). These tables exist so
-- assessments, lesson attempts and writing can be archived with indexes.

CREATE TABLE "language_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "currentLevel" TEXT NOT NULL,
    "levelSource" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "language_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "language_profiles_organizationId_userId_languageCode_key" ON "language_profiles"("organizationId", "userId", "languageCode");
CREATE INDEX "language_profiles_organizationId_userId_idx" ON "language_profiles"("organizationId", "userId");

CREATE TABLE "language_assessments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "overallLevel" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "language_assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "language_assessments_organizationId_userId_createdAt_idx" ON "language_assessments"("organizationId", "userId", "createdAt");

CREATE TABLE "language_lesson_attempts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "language_lesson_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "language_lesson_attempts_organizationId_userId_languageCode_idx" ON "language_lesson_attempts"("organizationId", "userId", "languageCode");

CREATE TABLE "language_vocab_cards" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "vocabId" TEXT NOT NULL,
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "language_vocab_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "language_vocab_cards_organizationId_userId_languageCode_vocabId_key" ON "language_vocab_cards"("organizationId", "userId", "languageCode", "vocabId");
CREATE INDEX "language_vocab_cards_organizationId_userId_nextReviewAt_idx" ON "language_vocab_cards"("organizationId", "userId", "nextReviewAt");

CREATE TABLE "language_writing_attempts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "language_writing_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "language_writing_attempts_organizationId_userId_createdAt_idx" ON "language_writing_attempts"("organizationId", "userId", "createdAt");
