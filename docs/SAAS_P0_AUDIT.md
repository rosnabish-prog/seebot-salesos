# SaaS P0 implementation

Scope: independent organization workspaces, multiple organization ownership per person, company-email-only identities. Source controls and disposable test evidence do not certify a deployment or replace an independent penetration test.

## Implemented changes

| Priority | Change | Verification |
|---|---|---|
| P0 | Tenant contact verification with reference/audit, sales activities, proposals, estimates, closure, and committed contract value | HTTP lifecycle reaches all eleven stages without overrides or database stage edits |
| P0 | FINANCE permissions independent from sales-write permission | FINANCE billing, reminder, credit-note, mailbox and payment operations; MEMBER rejected from finance approval |
| P0 | Shared selected-workspace, active-membership, active-organization and role policy; interceptor after identity guards | Same owner of two companies is denied with the wrong selected workspace; foreign records/files denied |
| P0 | Legacy Seebot record checks, staff directory and billing jobs restricted to Seebot | Negative HTTP tests for contracts, delivery, invoice/credit PDFs, reports, directories and billing previews |
| P0 | Outgoing messages recheck current membership, suppression, entity lineage and attachments before delivery | Removed members cannot send; recipient/entity mismatch rejected before provider invocation |
| P0 | Organization name, services and initiating employee used in tenant outreach; revisions preserve tenant signature | Generation and revision contain the selected tenant name, not hardcoded Seebot branding |
| P0 | Versioned immutable baseline and incremental migration, committed npm lockfile, deterministic CI | Fresh deploy, existing-data upgrade and restore-before-upgrade rehearsal on disposable PostgreSQL |
| P0 | Patched mail/upload/build dependencies and single plain-address validation | Dependency audit plus real local SMTP and multipart upload regression checks |
| P0 | PostgreSQL atomic shared authentication counters, per-identity/IP/challenge limits and resend cooldown | Independent service instances cannot exceed the shared allowance; limit failure returns 429, database outage fails closed |
| P0 | Single-use offline recovery codes, email OTP setup reauthentication, atomic consumption, password-version binding | Wrong-purpose challenge and replay rejected; recovery invalidates existing sessions |

## Organization policy

- A verified work identity can own multiple organizations, including organizations with different websites. A company email is required; an email/website resemblance is not proof of legal business ownership.
- New creators become OWNER. Existing active creator/administrator memberships are migrated to OWNER only where no active owner already exists.
- Ownership transfer requires the current owner and an active company-email member. Administrators cannot replace owner memberships. Last-administrator protection applies to older workspaces without an owner.
- Additional owners and members do not gain cross-company access. Selection is checked even when one person belongs to both organizations.

## Permission matrix

| Permission | OWNER | ADMIN | MEMBER | FINANCE | VIEWER |
|---|---|---|---|---|---|
| Read workspace relationship/commercial records | Yes | Yes | Yes | Yes | Yes |
| Edit sales, contacts, delivery, proposals | Yes | Yes | Yes | No | No |
| Finance operations, journals, client billing identity | Yes | Yes | No | Yes | No |
| Membership/settings administration, controlled approvals | Yes | Yes | No | No | No |
| Connect own Gmail | Yes | Yes | Yes | Yes | No |
| Transfer ownership | Yes | No | No | No | No |

FINANCE can operate billing/reminders and issue approved credits; credit approval, journal reversal and signed-PDF confirmation still require an administrator. All workspace members currently share visibility of relationship/commercial records; per-representative confidential territories are outside this release. VIEWER is supported by policy and tests but is not a public invitation option.

## Route audit boundaries

- `workspace-*`: IdentityGuard, shared access policy and global post-guard workspace interceptor; nested account/opportunity/contract/invoice/document references remain checked against the organization.
- `workspaces`: listing/creation/selection are identity operations; selected-company profile, members, audit and logos use the shared policy.
- Legacy CRM, finance, reporting, delivery and signing administration: AuthGuard restricts use to active Seebot members selecting Seebot; individual record authorization additionally checks organization lineage. Global roles do not bypass this boundary.
- Public surveys/signing: high-entropy invitation tokens, expiry/status checks and active owning organization; live provider gates remain in force.
- Outgoing mail: current actor, active owning organization/membership, category permission, entity/recipient and attachment scope are checked before provider access. Gmail credentials remain personal to the initiating platform identity, never shared with workspace teammates.

## Authentication operations

Counters use PostgreSQL across replicas and contain HMAC-derived identifiers instead of raw IP/email values. Deploy behind the configured trusted proxy count; never trust arbitrary forwarded headers. Expired `AuthRateLimit` rows should be purged by an operational retention job, e.g. a scheduled `DELETE ... WHERE expiresAt < NOW()`, after the required abuse-analysis retention period.

Recovery codes contain 128 bits of randomness, are stored as user-bound hashes, shown once and never emailed or logged. Setup requires an authenticated session, a recent sign-in or password confirmation, and a fresh email OTP bound specifically to setup. Recovery follows password/Google first-factor authentication and atomically consumes one code plus the login challenge; all older sessions/challenges are invalidated. A working mailbox is still required for initial account creation, password reset and recovery-code rotation. Authenticator/TOTP, enterprise SSO and managed recovery support remain separate work.

## Validation and remaining release gates

`scripts/saas-p0-e2e.cjs` starts the API in production mode against synthetic data and a local authenticated STARTTLS SMTP sink with a trusted test certificate. It verifies actual email/signup/MFA without test-code exposure, multi-company ownership, team invitations, normal salesperson progression, manually reviewed execution PDFs, delivery acceptance, invoice tax approval/issue/payments, ownership transfer, recovery and shared counters. It does not contact real email recipients or external providers.

Browser onboarding/finance and HTTP isolation suites now reach contracting through tenant APIs instead of directly changing the database stage. Policy tests, typechecks, API/Next.js builds and independent signing tamper tests remain required. Native PostgreSQL CI performs migration and backup/restore rehearsals; local WASM PostgreSQL checks are additional evidence, not a substitute for native CI.

Still required before real-customer production: managed secrets, hardened persistent hosting and storage, malware scanning, production mailbox/OAuth tests, monitoring, retention/privacy operations, backup restoration with the actual deployment, independent security review, and relevant accountant/signing legal approvals. Production tenancy/signing/provider flags are not automatically enabled by these changes.
