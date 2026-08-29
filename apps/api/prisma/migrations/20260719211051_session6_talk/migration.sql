-- CreateEnum
CREATE TYPE "TalkChannelType" AS ENUM ('DM', 'CHANNEL');

-- CreateEnum
CREATE TYPE "TalkChannelAccess" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "TalkMessageType" AS ENUM ('TEXT', 'SYSTEM', 'MEETING_SUMMARY', 'ACTION_ITEM', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotetakerStatus" AS ENUM ('IDLE', 'LISTENING', 'SUMMARIZING', 'DONE', 'ERROR');

-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionItemPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "MessageAttachment" ADD COLUMN     "talkMessageId" TEXT;

-- CreateTable
CREATE TABLE "TalkChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" "TalkChannelType" NOT NULL,
    "access" "TalkChannelAccess" NOT NULL DEFAULT 'PUBLIC',
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "dmPeerId" TEXT,
    "createdById" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalkChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalkMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TalkMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalkMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "type" "TalkMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "threadParentId" TEXT,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "lastReplyAt" TIMESTAMP(3),
    "reactions" JSONB NOT NULL DEFAULT '{}',
    "meetingId" TEXT,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalkMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledStart" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "notetakerAgentId" TEXT,
    "notetakerStatus" "NotetakerStatus" NOT NULL DEFAULT 'IDLE',
    "transcript" TEXT,
    "summary" TEXT,
    "decisions" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'attendee',
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "isNotetaker" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meetingId" TEXT,
    "channelId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActionItemStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ActionItemPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "agentAssigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TalkChannel_organizationId_type_lastMessageAt_idx" ON "TalkChannel"("organizationId", "type", "lastMessageAt");

-- CreateIndex
CREATE INDEX "TalkChannel_workspaceId_idx" ON "TalkChannel"("workspaceId");

-- CreateIndex
CREATE INDEX "TalkChannel_dmPeerId_idx" ON "TalkChannel"("dmPeerId");

-- CreateIndex
CREATE INDEX "TalkMember_channelId_idx" ON "TalkMember"("channelId");

-- CreateIndex
CREATE INDEX "TalkMember_userId_idx" ON "TalkMember"("userId");

-- CreateIndex
CREATE INDEX "TalkMember_agentId_idx" ON "TalkMember"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "TalkMember_channelId_userId_agentId_key" ON "TalkMember"("channelId", "userId", "agentId");

-- CreateIndex
CREATE INDEX "TalkMessage_channelId_createdAt_idx" ON "TalkMessage"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "TalkMessage_threadParentId_idx" ON "TalkMessage"("threadParentId");

-- CreateIndex
CREATE INDEX "TalkMessage_userId_idx" ON "TalkMessage"("userId");

-- CreateIndex
CREATE INDEX "TalkMessage_agentId_idx" ON "TalkMessage"("agentId");

-- CreateIndex
CREATE INDEX "Meeting_organizationId_status_scheduledStart_idx" ON "Meeting"("organizationId", "status", "scheduledStart");

-- CreateIndex
CREATE INDEX "Meeting_channelId_idx" ON "Meeting"("channelId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_agentId_key" ON "MeetingParticipant"("meetingId", "userId", "agentId");

-- CreateIndex
CREATE INDEX "ActionItem_organizationId_status_idx" ON "ActionItem"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ActionItem_meetingId_idx" ON "ActionItem"("meetingId");

-- CreateIndex
CREATE INDEX "ActionItem_assigneeId_idx" ON "ActionItem"("assigneeId");

-- CreateIndex
CREATE INDEX "ActionItem_agentAssigneeId_idx" ON "ActionItem"("agentAssigneeId");

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_talkMessageId_fkey" FOREIGN KEY ("talkMessageId") REFERENCES "TalkMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkChannel" ADD CONSTRAINT "TalkChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkChannel" ADD CONSTRAINT "TalkChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkChannel" ADD CONSTRAINT "TalkChannel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkMember" ADD CONSTRAINT "TalkMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TalkChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkMember" ADD CONSTRAINT "TalkMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkMember" ADD CONSTRAINT "TalkMember_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkMessage" ADD CONSTRAINT "TalkMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TalkChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkMessage" ADD CONSTRAINT "TalkMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkMessage" ADD CONSTRAINT "TalkMessage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkMessage" ADD CONSTRAINT "TalkMessage_threadParentId_fkey" FOREIGN KEY ("threadParentId") REFERENCES "TalkMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TalkChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_notetakerAgentId_fkey" FOREIGN KEY ("notetakerAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TalkChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_agentAssigneeId_fkey" FOREIGN KEY ("agentAssigneeId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
