-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "suspendedFromStatus" TEXT;

-- CreateTable
CREATE TABLE "WorkspaceAutomation" (
    "organizationId" TEXT NOT NULL,
    "billingDrafts" BOOLEAN NOT NULL DEFAULT false,
    "reminderTasks" BOOLEAN NOT NULL DEFAULT false,
    "enabledById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceAutomation_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "organizationId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "lastError" TEXT,
    "result" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_key_key" ON "BackgroundJob"("key");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_availableAt_idx" ON "BackgroundJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_organizationId_createdAt_idx" ON "BackgroundJob"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceAutomation" ADD CONSTRAINT "WorkspaceAutomation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

