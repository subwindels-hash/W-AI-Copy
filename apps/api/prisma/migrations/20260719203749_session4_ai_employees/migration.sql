-- Session 4: AI Employees — extend Agent, add AgentSkill, AgentMemory, AgentKnowledge, AgentEvent

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('IDLE', 'ONLINE', 'WORKING', 'ERROR', 'PAUSED', 'OFFLINE');
CREATE TYPE "MemoryType" AS ENUM ('FACT', 'PREFERENCE', 'PROCEDURE', 'CONVERSATION', 'TASK', 'FEEDBACK');
CREATE TYPE "KnowledgeType" AS ENUM ('DOCUMENT', 'URL', 'SNIPPET', 'FILE');
CREATE TYPE "AgentEventType" AS ENUM ('TASK_STARTED', 'TASK_COMPLETED', 'TASK_FAILED', 'MEMORY_STORED', 'KNOWLEDGE_ADDED', 'CONVERSATION_PARTICIPATED', 'ERROR', 'STATUS_CHANGED');

-- Migrate existing Agent.status (string) to new AgentStatus enum
ALTER TABLE "Agent" ADD COLUMN "status_new" "AgentStatus" NOT NULL DEFAULT 'IDLE';
UPDATE "Agent" SET "status_new" = CASE
  WHEN LOWER(status) = 'online' THEN 'ONLINE'::"AgentStatus"
  WHEN LOWER(status) = 'working' THEN 'WORKING'::"AgentStatus"
  WHEN LOWER(status) = 'error' THEN 'ERROR'::"AgentStatus"
  WHEN LOWER(status) = 'paused' THEN 'PAUSED'::"AgentStatus"
  WHEN LOWER(status) = 'offline' THEN 'OFFLINE'::"AgentStatus"
  ELSE 'IDLE'::"AgentStatus"
END;
ALTER TABLE "Agent" DROP COLUMN "status";
ALTER TABLE "Agent" RENAME COLUMN "status_new" TO "status";

-- AlterTable Agent
ALTER TABLE "Agent" ADD COLUMN     "department" TEXT DEFAULT 'General',
ADD COLUMN     "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "modelId" TEXT,
ADD COLUMN     "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
ADD COLUMN     "maxTokens" INTEGER NOT NULL DEFAULT 2048,
ADD COLUMN     "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "avatarStyle" TEXT;

-- CreateTable
CREATE TABLE "AgentSkill" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSkill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentSkill_agentId_name_key" ON "AgentSkill"("agentId", "name");

CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "MemoryType" NOT NULL DEFAULT 'FACT',
    "content" TEXT NOT NULL,
    "source" TEXT,
    "sourceRef" TEXT,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentMemory_agentId_type_idx" ON "AgentMemory"("agentId", "type");
CREATE INDEX "AgentMemory_agentId_importance_idx" ON "AgentMemory"("agentId", "importance");
CREATE INDEX "AgentMemory_agentId_createdAt_idx" ON "AgentMemory"("agentId", "createdAt");

CREATE TABLE "AgentKnowledge" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "KnowledgeType" NOT NULL DEFAULT 'SNIPPET',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "mimeType" TEXT,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentKnowledge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentKnowledge_agentId_type_idx" ON "AgentKnowledge"("agentId", "type");
CREATE INDEX "AgentKnowledge_agentId_createdAt_idx" ON "AgentKnowledge"("agentId", "createdAt");

CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "AgentEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentEvent_agentId_createdAt_idx" ON "AgentEvent"("agentId", "createdAt");
CREATE INDEX "AgentEvent_agentId_type_idx" ON "AgentEvent"("agentId", "type");

-- AddForeignKeys
ALTER TABLE "AgentSkill" ADD CONSTRAINT "AgentSkill_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentKnowledge" ADD CONSTRAINT "AgentKnowledge_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
