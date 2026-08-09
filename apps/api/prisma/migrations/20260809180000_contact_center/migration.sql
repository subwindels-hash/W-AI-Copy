-- Session: Contact & Support Center.
-- Persistent contact requests with communication and status history.

CREATE TABLE "ContactRequest" (
  "id" TEXT NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "organizationId" TEXT,
  "userId" TEXT,
  "accountId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "country" TEXT,
  "company" TEXT,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "preferredContactMethod" TEXT NOT NULL DEFAULT 'email',
  "aiConversationId" TEXT,
  "aiSummary" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "status" TEXT NOT NULL DEFAULT 'new',
  "department" TEXT NOT NULL DEFAULT 'general',
  "assignedUserId" TEXT,
  "assignedAgentId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'web',
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactMessage" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "authorType" TEXT NOT NULL DEFAULT 'user',
  "authorId" TEXT,
  "authorName" TEXT,
  "body" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactStatusHistory" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "changedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactRequest_requestNumber_key" ON "ContactRequest"("requestNumber");
CREATE INDEX "ContactRequest_userId_idx" ON "ContactRequest"("userId");
CREATE INDEX "ContactRequest_email_idx" ON "ContactRequest"("email");
CREATE INDEX "ContactRequest_status_idx" ON "ContactRequest"("status");
CREATE INDEX "ContactRequest_category_idx" ON "ContactRequest"("category");
CREATE INDEX "ContactRequest_department_idx" ON "ContactRequest"("department");
CREATE INDEX "ContactRequest_createdAt_idx" ON "ContactRequest"("createdAt");
CREATE INDEX "ContactMessage_requestId_idx" ON "ContactMessage"("requestId");
CREATE INDEX "ContactStatusHistory_requestId_idx" ON "ContactStatusHistory"("requestId");

ALTER TABLE "ContactRequest"
  ADD CONSTRAINT "ContactRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContactMessage"
  ADD CONSTRAINT "ContactMessage_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactStatusHistory"
  ADD CONSTRAINT "ContactStatusHistory_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
