-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('TEXT', 'STICKY', 'AI', 'EMBED', 'HEADING', 'TODO');

-- CreateEnum
CREATE TYPE "CanvasAccess" AS ENUM ('PRIVATE', 'WORKSPACE', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "Canvas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "access" "CanvasAccess" NOT NULL DEFAULT 'WORKSPACE',
    "createdById" TEXT NOT NULL,
    "backgroundColor" TEXT DEFAULT '#0A0F1A',
    "thumbnailUrl" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "viewportX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewportY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewportZoom" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Canvas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasBlock" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "type" "BlockType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 280,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 140,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL DEFAULT '{}',
    "style" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasConnection" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "label" TEXT,
    "color" TEXT DEFAULT 'azure',
    "style" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Canvas_organizationId_updatedAt_idx" ON "Canvas"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "Canvas_workspaceId_idx" ON "Canvas"("workspaceId");

-- CreateIndex
CREATE INDEX "CanvasBlock_canvasId_idx" ON "CanvasBlock"("canvasId");

-- CreateIndex
CREATE INDEX "CanvasConnection_canvasId_idx" ON "CanvasConnection"("canvasId");

-- CreateIndex
CREATE INDEX "CanvasConnection_fromId_idx" ON "CanvasConnection"("fromId");

-- CreateIndex
CREATE INDEX "CanvasConnection_toId_idx" ON "CanvasConnection"("toId");

-- CreateIndex
CREATE INDEX "Agent_organizationId_status_idx" ON "Agent"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "Canvas" ADD CONSTRAINT "Canvas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Canvas" ADD CONSTRAINT "Canvas_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Canvas" ADD CONSTRAINT "Canvas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasBlock" ADD CONSTRAINT "CanvasBlock_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasConnection" ADD CONSTRAINT "CanvasConnection_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasConnection" ADD CONSTRAINT "CanvasConnection_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "CanvasBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasConnection" ADD CONSTRAINT "CanvasConnection_toId_fkey" FOREIGN KEY ("toId") REFERENCES "CanvasBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
