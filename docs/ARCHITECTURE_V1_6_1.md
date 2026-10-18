# Seebot SalesOS — Source organization and module ownership (v1.6.1)

This project is a NestJS / Prisma / PostgreSQL API and Next.js application organized by business capability. **New code is intentionally split into focused files**; do not place unrelated controllers or services in a page file.

## Directory map

```
apps/api/src/
  auth/
    auth.controller.ts             Password login + existing auth endpoints
    google-login.controller.ts     Google Identity Services login for pre-existing employees
    auth.service.ts                Password hashing + session issuance
  organizations/
    organizations.controller.ts    Seebot profile, business context, billing identity
    employee-invitation.controller.ts   Google-verified staff invitations and acceptance
  integrations/google/
    google-identity.service.ts     Verifies signed Google ID tokens
    gmail-connection.service.ts    Per-employee Gmail OAuth and Gmail delivery adapter
    gmail-connection.controller.ts OAuth connection endpoints / callback
    token-cipher.ts                AES-256-GCM encryption for refresh tokens
  communications/
    outgoing-message.service.ts   Single audited outbox; checks recipient/actor/event status
    outgoing-message.controller.ts Message status + explicit send/retry API
  contracts/
    contract-pricing.controller.ts Structured multiple price lines, one contract
    pricing-validation.ts         Price model validation
  signing/
    signing.controller.ts         Restricted contract invitations, signer PDF and audit
    security.ts                   Invitation digests, consent version and audit hashing
  invoices/
    invoice-pdf.service.ts        Number allocation, PDF issue, SHA-256 verification
    invoice-pdf.controller.ts     Download issued PDF + send as Gmail attachment
  clients/
    clients.controller.ts         Existing client + legacy invoice/contract/feedback routes
  opportunities/                  Kanban workflow, stage evidence and demo AI assistant
  intelligence/                   Existing research and AI demo providers
  dashboard/                      Sales/financial summaries
  common/                         Shared auth guard and permissions

apps/web/
  app/login/page.tsx               Password and Google sign-in
  app/accept-invite/page.tsx       Google-verification employee activation
  app/sign/[token]/page.tsx        External contract signing (no CRM account required)
  app/(workspace)/clients/[id]/page.tsx  Client lifecycle, invoice/pricing/signature UI
  app/(workspace)/settings/page.tsx      Admin shell for company and invitations
  app/(workspace)/profile/page.tsx       My account and Gmail connection
  src/components/organization/    Company profile and invitation panels
  src/components/integrations/    Gmail connection panel
  src/components/contract-pricing-panel.tsx
  src/components/google-login-button.tsx
  src/types/google.d.ts           Shared browser identity-service types

packages/database/prisma/schema.prisma   Database schema (migration reviewed separately)
packages/database/prisma/bootstrap-seebot-organization.ts   Assigns existing users to Seebot
```

## Real user workflow

1. Seebot owner maintains organization profile and billing/legal identity.
2. Existing staff may sign in with Google. The Google email MUST already exist as an active SalesOS user and the Google `sub` is bound to that record.
3. Staff connect Gmail separately, granting `gmail.send` only; token is stored as AES-256-GCM encrypted data. Google sign-in alone never grants mailbox access.
4. An administrator creates an invitation, which enters the audited `OutgoingMessage` outbox and is sent only when Gmail is ready.
5. Contract draft signing invitations, executed-document receipts, and approved invoice PDF attachments use the same audited outbound service.
6. Seebot's existing client/prospect records are not copied across workspaces. Users access them under the Seebot organization, as before.

## Guardrails and explicit non-goals of v1.6.1

- **No multi-company public signup yet.** Existing business queries are not consistently tenant-scoped. The organization model cannot be treated as an authorization boundary until all endpoints are migrated, backfilled and tested.
- **No live sending unless explicitly enabled.** `GMAIL_SENDING_ENABLED=false` is the safe default. A connection and a separately authorized send operation are required.
- **No automatic Gmail reply sync.** `gmail.send` is the only Gmail scope; read operations, watches and Pub/Sub need later integration and approval.
- **No automatic payment detection.** Finance still confirms payments; overdue reminders still create approval tasks.
- **No unverified signature claims.** Production signing also requires an externally reviewed legal/security posture, HTTPS, stable audit storage, rate limits and end-to-end tests. A Google login is not legal identity verification or company authority certification.
- **Invoice PDF issuance is not a general accounting system.** Finance must check seller/buyer legal details, tax rules and correct amounts. Invoice PDF numbers are generated at issuance; document bytes and hash are retained.
- **Unfinished legacy refactor.** `clients/clients.controller.ts` and large opportunity/web pages predate the modular structure. Their extraction into ClientAccess, Contracts, Billing, Surveys and UI subcomponents should be done with regression tests in the next code-quality increment, rather than by unsafe bulk splitting.

## Multi-company release gates

Before allowing additional organizations: organization-scoped `Account`, `Contact`, `Opportunity`, `Campaign`, `Industry`, `Invoice`, `Contract`, `Task`, `AuditEvent`, documents, signing and intelligence data; require membership in all controllers; enforce ownership in relational writes; bootstrap existing Seebot records; review unique constraints (especially account domain and industry name); add cross-tenant negative tests on every route and document download; security test uploads and Google OAuth. Public registration and workspace switching are intentionally disabled until these pass.

## Before deployment

Run Prisma migration review on a database snapshot, generate client, run `npm.cmd run typecheck`, `npm.cmd run test`, `npm.cmd run build`, and test login, invitation, signing, invoice issue/email/receipt and permission denial in a real browser. Test with two distinct Google identities. Never share `.env`, API credentials, document storage or database backups with the source ZIP.
