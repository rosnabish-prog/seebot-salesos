# Seebot SalesOS

**Status: consolidated development preview — not approved for production or real customer records.**

SalesOS is a B2B sales, contracting, delivery, client-success and receivables workspace, built with **Next.js 15**, **NestJS 10**, **TypeScript**, **Prisma**, and **PostgreSQL 16**.

The maintained product specification and implementation audit are in [Product Consolidation Audit](docs/PRODUCT_CONSOLIDATION_AUDIT.md) and [Product Orchestration v2](docs/PRODUCT_ORCHESTRATION_V2.md). Earlier `RELEASE_V1_*.md` documents describe historical milestones, **not the current authentication/security behavior**.

## Canonical end-to-end product flow

1. Register a work identity with verification, or accept a verified invitation; authenticate using password or configured Google login.
2. Complete **email one-time-code MFA on every sign-in**. Sessions have an absolute seven-day reauthentication boundary. Email signup verification alone does not create a session.
3. Create company workspaces you own (or join an invitation), configure optional business details, and invite employees with roles and membership controls.
4. Create one canonical **Account** (customer company), with reusable contacts and an initial **Opportunity**. One Account may have multiple opportunities and engagements.
5. Move opportunities through the canonical **11-stage** pipeline using evidence, configured labels/fields and permitted auto-pull from existing records. Contract and authorization checks cannot be bypassed by manager overrides.
6. At **Pilot Contracted**, the existing Account appears in Client Management as **Contracting**. At **Closed Won**, it becomes **Customer**. Do **not** create a second company or duplicate contacts.
7. Track contract proposals, scoped pricing, approved agreements, private PDFs, delivery milestones, acceptance evidence, tasks, and account issues.
8. Collect client satisfaction through **NPS, CSAT and reusable custom questionnaires**, then produce approved MBR/QBR snapshots and review renewal/expansion opportunities.
9. Prepare reviewed invoices, issue PDFs after finance controls, record partial/full payments, credits and journal entries, and reconcile receivables. Real tax treatment requires independent professional review.

## Key security and integration rules

- Legacy Seebot-only CRM routes remain separated from independent organizations; do **not** remove tenant checks or activate multi-tenant production without authorization testing.
- MFA is mandatory after password login, Google login and new-team invitation acceptance. Signup links prove an email address **but do not issue sessions**. Repeated OTP attempts are atomically limited; outstanding codes are revoked after password change/reset.
- Administrator direct provisioning of employee passwords is disabled by default. Use the verified employee/workspace invitation flows.
- Private development previews use **fictional data** only. The preview's email capture (Mailpit) is not real mailbox or corporate ownership verification.
- Live electronic signing, regulated accounting/tax determination, bulk outbound messaging and real provider integrations remain **gated** until credentials, operational checks and legal/security controls are approved.
- Sensitive server cookies are HttpOnly and Secure on HTTPS production deployments; keep ports private and secrets outside Git.

## Open and inspect the product using GitHub Codespaces

No local PowerShell setup is required for this private preview.

1. Open **Code → Codespaces** in this repository. Start a Codespace from the default `main` branch (the consolidated source is now merged).
2. In its terminal, run `bash scripts/start-codespaces.sh` from the repository root.
3. The helper configures a **disposable** local PostgreSQL/Redis/Mailpit environment, an isolated private `.env`, and a fictional admin account. Never connect this helper to live records.
4. In the Codespace **Ports** tab, keep **3000** (app) and **8025** (test email inbox) **Private**; open the forwarded HTTPS URL for port 3000.
5. Sign in with the preview admin credentials printed by the helper, and retrieve the mandatory OTP from the private Mailpit inbox on port 8025.

See [Codespaces Authentication Preview](docs/CODESPACES_AUTH_PREVIEW.md) and [Multi-tenant Enablement](docs/MULTITENANT_ENABLEMENT.md).

## Automated verification

GitHub Actions runs [build and database checks](.github/workflows/checks.yml):

- Prisma schema validation plus review-only generated SQL baseline.
- Disposable PostgreSQL schema setup and client generation.
- Shared types, NestJS and Next.js TypeScript checks and builds.
- Source and policy tests; independent signing-evidence verification/tamper rejection.
- Real cross-tenant HTTP checks using **two** isolated organizations.
- Browser E2E from verified identity and MFA through company setup, prospect, client feedback, contracts, invoice preparation and finance approval.
- Downloadable real browser screenshots and a migration-review SQL artifact.

The workflow uses a newly created disposable CI database. `prisma db push` is used **only** in that disposable environment, **never on live PostgreSQL**.

A green CI run is a development quality gate, not proof of production readiness.

## Release prerequisites

Before production, complete and independently verify:

- Rehearsed baseline + incremental Prisma migrations against a protected copy of existing data, tested backups and restores, and reconciliation.
- Reviewed root dependency lockfile and deterministic builds, vulnerability review, application observability and access/audit retention.
- Distributed password/OTP abuse prevention, account recovery and multifactor recovery, security review and penetration testing.
- Complete production tenant boundary and permission review, including nested IDs, exports, documents and asynchronous jobs.
- Actual OAuth/SMTP/Gmail provider credentials, sending consent, and observed delivery/retry errors.
- Secure document object storage, malware scanning, signing evidence custody, legal e-sign review, and jurisdiction-specific finance/tax review.
- Accessible responsive visual QA, permanent HTTPS staging deployment, browser/UAT regression and production rollback plan.

Track acceptance evidence in [SalesOS release checklist #4](https://github.com/rosnabish-prog/seebot-salesos/issues/4). The source from [Pull Request #1](https://github.com/rosnabish-prog/seebot-salesos/pull/1) is now merged into `main`. Older overlapping PRs #2/#3 were closed without merging their incompatible implementations. Keep all real signing, tenant production activation and finance/legal provider gates disabled until separately certified.

## SaaS P0 hardening

One verified company-email identity may own multiple independent organizations. Personal email providers remain blocked. Tenant roles are OWNER, ADMIN, MEMBER, FINANCE and read-only VIEWER (reserved for controlled provisioning). Global Seebot staff roles never grant access to an independent organization.

See [SaaS P0 implementation and remaining release gates](docs/SAAS_P0_AUDIT.md) and [versioned database deployment](docs/DATABASE_MIGRATIONS.md). New installations use `npm ci`, `npm run db:generate`, and reviewed `prisma migrate deploy`; never `db push` against persistent data.
