-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "verificationReference" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "OutreachDraft" ADD COLUMN     "opportunityId" TEXT;

-- AlterTable
ALTER TABLE "LoginChallenge" ADD COLUMN     "passwordVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'LOGIN';

-- CreateTable
CREATE TABLE "AuthRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "MfaRecoveryCode_userId_usedAt_idx" ON "MfaRecoveryCode"("userId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_sourceKey_key" ON "Activity"("sourceKey");

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Invalidate pre-upgrade challenges; their password-version binding was not recorded.
UPDATE "LoginChallenge" SET "consumedAt"=CURRENT_TIMESTAMP,"expiresAt"=CURRENT_TIMESTAMP WHERE "consumedAt" IS NULL;
-- Existing creators become owners only where no active owner already exists.
UPDATE "OrganizationMembership" m SET "role"='OWNER'
FROM "Organization" o WHERE m."organizationId"=o.id AND m."userId"=o."createdById"
 AND m.status='ACTIVE' AND m.role='ADMIN'
 AND NOT EXISTS (SELECT 1 FROM "OrganizationMembership" x WHERE x."organizationId"=o.id AND x.role='OWNER' AND x.status='ACTIVE');

-- Preserve the tenant lineage of historical legacy mail before enforcing scoped retries.
WITH lineage AS (
 SELECT 'OUTREACH_DRAFT' AS kind,d.id,a."organizationId" FROM "OutreachDraft" d JOIN "Account" a ON a.id=d."accountId"
 UNION ALL SELECT 'INVOICE',i.id,a."organizationId" FROM "Invoice" i JOIN "Account" a ON a.id=i."accountId"
 UNION ALL SELECT 'CLIENT_SURVEY',s.id,a."organizationId" FROM "ClientSurveyInvitation" s JOIN "Account" a ON a.id=s."accountId"
 UNION ALL SELECT 'WORKSPACE_INVITATION',i.id,i."organizationId" FROM "WorkspaceInvitation" i
 UNION ALL SELECT 'EMPLOYEE_INVITATION',i.id,i."organizationId" FROM "EmployeeInvitation" i
 UNION ALL SELECT 'CONTRACT',c.id,a."organizationId" FROM "Contract" c JOIN "Opportunity" o ON o.id=c."opportunityId" JOIN "Account" a ON a.id=o."accountId"
 UNION ALL SELECT 'SIGNING_ENVELOPE',e.id,a."organizationId" FROM "SigningEnvelope" e JOIN "Contract" c ON c.id=e."contractId" JOIN "Opportunity" o ON o.id=c."opportunityId" JOIN "Account" a ON a.id=o."accountId"
)
UPDATE "OutgoingMessage" m SET "organizationId"=l."organizationId" FROM lineage l
WHERE m."organizationId" IS NULL AND m."entityType"=l.kind AND m."entityId"=l.id AND l."organizationId" IS NOT NULL;
-- Link old unsent drafts only when account context is unambiguous. Never invent sales activities.
WITH single_open AS (SELECT "accountId",MIN(id) AS id FROM "Opportunity" WHERE status='OPEN' GROUP BY "accountId" HAVING COUNT(*)=1)
UPDATE "OutreachDraft" d SET "opportunityId"=o.id FROM single_open o WHERE d."opportunityId" IS NULL AND d.status='DRAFT' AND d."accountId"=o."accountId";
