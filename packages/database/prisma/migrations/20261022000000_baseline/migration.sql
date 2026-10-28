-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'CEO', 'DIRECTOR', 'SALES_MANAGER', 'SALES_REP', 'TECHNICAL_REVIEWER');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'NURTURE', 'CLOSED_LOST', 'UNQUALIFIED', 'CLOSED_WON');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('EMAIL', 'CALL', 'MEETING', 'LINKEDIN', 'NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityOutcome" AS ENUM ('OUTBOUND', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'NO_RESPONSE', 'OPTED_OUT', 'BOUNCED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('NDA', 'MSA', 'SOW', 'DPA', 'PRODUCTION_OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SIGNED', 'PENDING_SIGNATURE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ContractPricingModel" AS ENUM ('FIXED', 'HOURLY', 'UNIT', 'MONTHLY_RETAINER', 'FTE', 'MILESTONE', 'OUTCOME');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordVersion" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SALES_REP',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleSubject" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "organizationId" TEXT,
    "website" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'Researching',
    "hypothesis" TEXT NOT NULL,
    "country" TEXT,
    "billingAddress" TEXT,
    "taxRegistrationNumber" TEXT,
    "ownerId" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "clientSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "source" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'ACCOUNT_RESEARCHED',
    "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT NOT NULL,
    "serviceLine" TEXT NOT NULL,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "estimatedAmount" DECIMAL(18,2),
    "contractedAmount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageVisit" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),

    CONSTRAINT "StageVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTransition" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStage" TEXT NOT NULL,
    "toStage" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "automated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageComment" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "StageComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "opportunityId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "outcome" "ActivityOutcome" NOT NULL,
    "note" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "acceptanceCriteria" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "evidenceReference" TEXT,
    "signedAt" TIMESTAMP(3),
    "signatureDueAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sentForSignatureAt" TIMESTAMP(3),
    "committedAmount" DECIMAL(18,2),
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "parentContractId" TEXT,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "objective" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Industry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Industry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAccount" (
    "campaignId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignAccount_pkey" PRIMARY KEY ("campaignId","accountId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceRun" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DEMO',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "IntelligenceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "ownerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mode" TEXT NOT NULL DEFAULT 'DEMO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachRevision" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "beforeSubject" TEXT NOT NULL,
    "beforeBody" TEXT NOT NULL,
    "afterSubject" TEXT NOT NULL,
    "afterBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "draftId" TEXT,
    "contactId" TEXT,
    "direction" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DEMO',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "analysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityStageDraft" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "suggestions" JSONB NOT NULL DEFAULT '[]',
    "feedback" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'DEMO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityStageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EXECUTED',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignatureEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "signerName" TEXT,
    "signerEmail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalReference" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ContractSignatureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "contractId" TEXT,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceReminder" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "mode" TEXT NOT NULL DEFAULT 'DRAFT_ONLY',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "InvoiceReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientReview" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "score" INTEGER,
    "summary" TEXT NOT NULL,
    "actionItems" JSONB NOT NULL DEFAULT '[]',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientIssue" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ClientIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "description" TEXT,
    "services" JSONB NOT NULL DEFAULT '[]',
    "idealCustomers" TEXT,
    "country" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'GBP',
    "logoUrl" TEXT,
    "logoStorageKey" TEXT,
    "logoSha256" TEXT,
    "billingAddress" TEXT,
    "taxRegistrationNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "ContractPricingLine" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "model" "ContractPricingModel" NOT NULL,
    "unit" TEXT,
    "rate" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "billingFrequency" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractPricingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningEnvelope" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentSha256" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientGoogleSub" TEXT,
    "signatoryId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedDocumentId" TEXT,

    CONSTRAINT "SigningEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningAuditEvent" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actorEmail" TEXT,
    "googleSub" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousDigest" TEXT NOT NULL,
    "digest" TEXT NOT NULL,

    CONSTRAINT "SigningAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "googleSubject" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleOAuthState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdById" TEXT NOT NULL,
    "gmailConnectionId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attachmentInvoiceId" TEXT,
    "attachmentContractDocumentId" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutgoingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("organizationId","year")
);

-- CreateTable
CREATE TABLE "InvoiceDocument" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "invitedName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientSurveyInvitation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "templateId" TEXT,
    "questionnaire" JSONB NOT NULL DEFAULT '[]',
    "answers" JSONB,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "score" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSurveyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientSurveyTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CUSTOM',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientSurveyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientReport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "templateId" TEXT,

    CONSTRAINT "ClientReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalPlan" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalAutomationEvent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalAutomationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAmendment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignatory" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SIGNER',
    "signingOrder" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignatory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAdjustment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRecipient" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'TO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSchedule" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL,
    "nextDueAt" TIMESTAMP(3),
    "milestoneId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryMilestone" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contractId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "acceptanceCriteria" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "actualAcceptedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAction" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "organizationId" TEXT NOT NULL,
    "targetIndustries" JSONB NOT NULL DEFAULT '[]',
    "plan" TEXT NOT NULL DEFAULT 'ALL_FEATURES_UNLOCKED',
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "pipelineConfig" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteSequence" (
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CreditNoteSequence_pkey" PRIMARY KEY ("organizationId","year")
);

-- CreateTable
CREATE TABLE "CreditNoteDocument" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT NOT NULL,

    CONSTRAINT "CreditNoteDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingJournal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedJournalId" TEXT,

    CONSTRAINT "AccountingJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPosting" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,

    CONSTRAINT "AccountingPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementRow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountReference" TEXT NOT NULL,
    "statementReference" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "valueDate" TIMESTAMP(3) NOT NULL,
    "paymentRecordId" TEXT,
    "matchedById" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "ratePercent" DECIMAL(9,4) NOT NULL,
    "invoiceNote" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTaxReview" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "reviewedSubtotal" DECIMAL(18,2) NOT NULL,
    "reviewedTax" DECIMAL(18,2) NOT NULL,
    "reviewedTotal" DECIMAL(18,2) NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "taxRuleId" TEXT,
    "ruleCodeSnapshot" TEXT,
    "ruleInvoiceNoteSnapshot" TEXT,
    "ratePercentSnapshot" DECIMAL(9,4),
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceTaxReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignupChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'EMAIL',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");

-- CreateIndex
CREATE INDEX "Account_ownerId_idx" ON "Account"("ownerId");

-- CreateIndex
CREATE INDEX "Account_organizationId_idx" ON "Account"("organizationId");

-- CreateIndex
CREATE INDEX "Account_industry_idx" ON "Account"("industry");

-- CreateIndex
CREATE INDEX "Account_status_isDemo_idx" ON "Account"("status", "isDemo");

-- CreateIndex
CREATE UNIQUE INDEX "Account_organizationId_domain_key" ON "Account"("organizationId", "domain");

-- CreateIndex
CREATE INDEX "Contact_accountId_idx" ON "Contact"("accountId");

-- CreateIndex
CREATE INDEX "Opportunity_ownerId_status_stage_idx" ON "Opportunity"("ownerId", "status", "stage");

-- CreateIndex
CREATE INDEX "Opportunity_createdAt_idx" ON "Opportunity"("createdAt");

-- CreateIndex
CREATE INDEX "StageVisit_opportunityId_enteredAt_idx" ON "StageVisit"("opportunityId", "enteredAt");

-- CreateIndex
CREATE INDEX "StageTransition_opportunityId_createdAt_idx" ON "StageTransition"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "StageComment_visitId_createdAt_idx" ON "StageComment"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_dueAt_idx" ON "Task"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_organizationId_status_idx" ON "Task"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Activity_opportunityId_occurredAt_idx" ON "Activity"("opportunityId", "occurredAt");

-- CreateIndex
CREATE INDEX "Proposal_opportunityId_idx" ON "Proposal"("opportunityId");

-- CreateIndex
CREATE INDEX "Contract_opportunityId_idx" ON "Contract"("opportunityId");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_createdAt_idx" ON "Campaign"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Industry_name_key" ON "Industry"("name");

-- CreateIndex
CREATE INDEX "CampaignAccount_accountId_idx" ON "CampaignAccount"("accountId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "IntelligenceRun_accountId_kind_createdAt_idx" ON "IntelligenceRun"("accountId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachDraft_accountId_updatedAt_idx" ON "OutreachDraft"("accountId", "updatedAt");

-- CreateIndex
CREATE INDEX "OutreachRevision_draftId_createdAt_idx" ON "OutreachRevision"("draftId", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachMessage_accountId_createdAt_idx" ON "OutreachMessage"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "OpportunityStageDraft_opportunityId_updatedAt_idx" ON "OpportunityStageDraft"("opportunityId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityStageDraft_opportunityId_stage_key" ON "OpportunityStageDraft"("opportunityId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_storageKey_key" ON "ContractDocument"("storageKey");

-- CreateIndex
CREATE INDEX "ContractDocument_contractId_uploadedAt_idx" ON "ContractDocument"("contractId", "uploadedAt");

-- CreateIndex
CREATE INDEX "ContractSignatureEvent_contractId_occurredAt_idx" ON "ContractSignatureEvent"("contractId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_accountId_dueAt_idx" ON "Invoice"("accountId", "dueAt");

-- CreateIndex
CREATE INDEX "Invoice_status_dueAt_idx" ON "Invoice"("status", "dueAt");

-- CreateIndex
CREATE INDEX "PaymentRecord_invoiceId_paidAt_idx" ON "PaymentRecord"("invoiceId", "paidAt");

-- CreateIndex
CREATE INDEX "InvoiceReminder_invoiceId_scheduledFor_idx" ON "InvoiceReminder"("invoiceId", "scheduledFor");

-- CreateIndex
CREATE INDEX "ClientReview_accountId_occurredAt_idx" ON "ClientReview"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "ClientIssue_accountId_status_idx" ON "ClientIssue"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_createdById_idx" ON "Organization"("createdById");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "ContractPricingLine_contractId_createdAt_idx" ON "ContractPricingLine"("contractId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SigningEnvelope_tokenHash_key" ON "SigningEnvelope"("tokenHash");

-- CreateIndex
CREATE INDEX "SigningEnvelope_contractId_status_idx" ON "SigningEnvelope"("contractId", "status");

-- CreateIndex
CREATE INDEX "SigningEnvelope_contractId_signatoryId_idx" ON "SigningEnvelope"("contractId", "signatoryId");

-- CreateIndex
CREATE INDEX "SigningEnvelope_recipientEmail_status_idx" ON "SigningEnvelope"("recipientEmail", "status");

-- CreateIndex
CREATE INDEX "SigningAuditEvent_envelopeId_occurredAt_idx" ON "SigningAuditEvent"("envelopeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SigningAuditEvent_envelopeId_sequence_key" ON "SigningAuditEvent"("envelopeId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "GmailConnection_userId_key" ON "GmailConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleOAuthState_stateHash_key" ON "GoogleOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "GoogleOAuthState_expiresAt_idx" ON "GoogleOAuthState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingMessage_idempotencyKey_key" ON "OutgoingMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutgoingMessage_entityType_entityId_createdAt_idx" ON "OutgoingMessage"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "OutgoingMessage_status_createdAt_idx" ON "OutgoingMessage"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocument_invoiceId_key" ON "InvoiceDocument"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocument_storageKey_key" ON "InvoiceDocument"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeInvitation_tokenHash_key" ON "EmployeeInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "EmployeeInvitation_organizationId_invitedEmail_idx" ON "EmployeeInvitation"("organizationId", "invitedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ClientSurveyInvitation_tokenHash_key" ON "ClientSurveyInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientSurveyInvitation_accountId_createdAt_idx" ON "ClientSurveyInvitation"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientSurveyInvitation_status_expiresAt_idx" ON "ClientSurveyInvitation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ClientSurveyInvitation_templateId_idx" ON "ClientSurveyInvitation"("templateId");

-- CreateIndex
CREATE INDEX "ClientSurveyTemplate_organizationId_active_idx" ON "ClientSurveyTemplate"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ClientSurveyTemplate_organizationId_name_key" ON "ClientSurveyTemplate"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ClientReport_accountId_createdAt_idx" ON "ClientReport"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientReport_accountId_type_periodStart_periodEnd_idx" ON "ClientReport"("accountId", "type", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalPlan_contractId_key" ON "RenewalPlan"("contractId");

-- CreateIndex
CREATE INDEX "RenewalPlan_nextReviewAt_status_idx" ON "RenewalPlan"("nextReviewAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LocalAutomationEvent_key_key" ON "LocalAutomationEvent"("key");

-- CreateIndex
CREATE INDEX "LocalAutomationEvent_entityType_entityId_idx" ON "LocalAutomationEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ContractAmendment_contractId_effectiveAt_idx" ON "ContractAmendment"("contractId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAmendment_contractId_version_key" ON "ContractAmendment"("contractId", "version");

-- CreateIndex
CREATE INDEX "ContractSignatory_contractId_signingOrder_idx" ON "ContractSignatory"("contractId", "signingOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSignatory_contractId_email_key" ON "ContractSignatory"("contractId", "email");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_invoiceId_status_idx" ON "InvoiceAdjustment"("invoiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRecipient_invoiceId_email_key" ON "InvoiceRecipient"("invoiceId", "email");

-- CreateIndex
CREATE INDEX "BillingSchedule_contractId_status_idx" ON "BillingSchedule"("contractId", "status");

-- CreateIndex
CREATE INDEX "BillingSchedule_nextDueAt_status_idx" ON "BillingSchedule"("nextDueAt", "status");

-- CreateIndex
CREATE INDEX "DeliveryMilestone_accountId_status_dueAt_idx" ON "DeliveryMilestone"("accountId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ReviewAction_reportId_status_idx" ON "ReviewAction"("reportId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_organizationId_email_status_idx" ON "WorkspaceInvitation"("organizationId", "email", "status");

-- CreateIndex
CREATE INDEX "ReportTemplate_organizationId_type_active_idx" ON "ReportTemplate"("organizationId", "type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNoteDocument_adjustmentId_key" ON "CreditNoteDocument"("adjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNoteDocument_number_key" ON "CreditNoteDocument"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNoteDocument_storageKey_key" ON "CreditNoteDocument"("storageKey");

-- CreateIndex
CREATE INDEX "AccountingJournal_organizationId_postedAt_idx" ON "AccountingJournal"("organizationId", "postedAt");

-- CreateIndex
CREATE INDEX "AccountingJournal_sourceType_sourceId_idx" ON "AccountingJournal"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingJournal_organizationId_externalKey_key" ON "AccountingJournal"("organizationId", "externalKey");

-- CreateIndex
CREATE INDEX "AccountingPosting_journalId_idx" ON "AccountingPosting"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementRow_paymentRecordId_key" ON "BankStatementRow"("paymentRecordId");

-- CreateIndex
CREATE INDEX "BankStatementRow_organizationId_valueDate_idx" ON "BankStatementRow"("organizationId", "valueDate");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementRow_organizationId_bankAccountReference_statem_key" ON "BankStatementRow"("organizationId", "bankAccountReference", "statementReference");

-- CreateIndex
CREATE INDEX "TaxRule_organizationId_status_jurisdiction_idx" ON "TaxRule"("organizationId", "status", "jurisdiction");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_organizationId_code_key" ON "TaxRule"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceTaxReview_invoiceId_key" ON "InvoiceTaxReview"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SignupChallenge_email_key" ON "SignupChallenge"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SignupChallenge_tokenHash_key" ON "SignupChallenge"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetRequest_tokenHash_key" ON "PasswordResetRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetRequest_userId_expiresAt_idx" ON "PasswordResetRequest"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "LoginChallenge_userId_expiresAt_idx" ON "LoginChallenge"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageVisit" ADD CONSTRAINT "StageVisit_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageComment" ADD CONSTRAINT "StageComment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "StageVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageComment" ADD CONSTRAINT "StageComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAccount" ADD CONSTRAINT "CampaignAccount_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAccount" ADD CONSTRAINT "CampaignAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceRun" ADD CONSTRAINT "IntelligenceRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceRun" ADD CONSTRAINT "IntelligenceRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachRevision" ADD CONSTRAINT "OutreachRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "OutreachDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "OutreachDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityStageDraft" ADD CONSTRAINT "OpportunityStageDraft_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityStageDraft" ADD CONSTRAINT "OpportunityStageDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignatureEvent" ADD CONSTRAINT "ContractSignatureEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReminder" ADD CONSTRAINT "InvoiceReminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReview" ADD CONSTRAINT "ClientReview_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientIssue" ADD CONSTRAINT "ClientIssue_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPricingLine" ADD CONSTRAINT "ContractPricingLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningEnvelope" ADD CONSTRAINT "SigningEnvelope_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningEnvelope" ADD CONSTRAINT "SigningEnvelope_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ContractDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningAuditEvent" ADD CONSTRAINT "SigningAuditEvent_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "SigningEnvelope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleOAuthState" ADD CONSTRAINT "GoogleOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingMessage" ADD CONSTRAINT "OutgoingMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingMessage" ADD CONSTRAINT "OutgoingMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingMessage" ADD CONSTRAINT "OutgoingMessage_gmailConnectionId_fkey" FOREIGN KEY ("gmailConnectionId") REFERENCES "GmailConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeInvitation" ADD CONSTRAINT "EmployeeInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeInvitation" ADD CONSTRAINT "EmployeeInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSurveyInvitation" ADD CONSTRAINT "ClientSurveyInvitation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSurveyInvitation" ADD CONSTRAINT "ClientSurveyInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSurveyInvitation" ADD CONSTRAINT "ClientSurveyInvitation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClientSurveyTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSurveyTemplate" ADD CONSTRAINT "ClientSurveyTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSurveyTemplate" ADD CONSTRAINT "ClientSurveyTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReport" ADD CONSTRAINT "ClientReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReport" ADD CONSTRAINT "ClientReport_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalPlan" ADD CONSTRAINT "RenewalPlan_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignatory" ADD CONSTRAINT "ContractSignatory_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRecipient" ADD CONSTRAINT "InvoiceRecipient_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSchedule" ADD CONSTRAINT "BillingSchedule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryMilestone" ADD CONSTRAINT "DeliveryMilestone_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryMilestone" ADD CONSTRAINT "DeliveryMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAction" ADD CONSTRAINT "ReviewAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ClientReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteSequence" ADD CONSTRAINT "CreditNoteSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteDocument" ADD CONSTRAINT "CreditNoteDocument_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "InvoiceAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingJournal" ADD CONSTRAINT "AccountingJournal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPosting" ADD CONSTRAINT "AccountingPosting_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "AccountingJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementRow" ADD CONSTRAINT "BankStatementRow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementRow" ADD CONSTRAINT "BankStatementRow_paymentRecordId_fkey" FOREIGN KEY ("paymentRecordId") REFERENCES "PaymentRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTaxReview" ADD CONSTRAINT "InvoiceTaxReview_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginChallenge" ADD CONSTRAINT "LoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

