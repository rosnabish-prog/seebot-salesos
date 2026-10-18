# Seebot SalesOS v1.6.4 — Commercial Workflow & Organization Setup Preview

**Status: DEVELOPMENT PREVIEW. Not approved for public multi-company use, legal e-signing, accounting, or live external messaging.**

## Baseline

Applies on top of **v1.6.3**. Source patch only; the installer does not change `.env`, database state, or API keys. Existing API configuration endpoints remain in place. Demo external services remain the default.

## Delivered in source

- Organization profile creation and setup for already-authenticated platform users, private PNG/JPEG logo upload/download, industry/services/ideal-customer info, all-features-unlocked placeholder, and member management for existing verified employees.
- **Security gate:** the original CRM remains available **only to active Seebot organization members**. A member selecting another organization is barred from legacy business routes. New organization profiles can be created but **cannot use the CRM** yet.
- Contract MSA/SOW parent links, effective-dated pricing amendments and stored versions, manager commercial approvals, and ordered signer records (records are not invitations or executed signatures).
- Signing frontend supports typed, drawn, or uploaded PNG image signatures in the disabled-by-default Google restricted signer preview. SHA-256 image hashes and in-app hash-chain verification endpoint added. This is NOT independent, tamper-proof signing evidence or an approved legal signing solution.
- Invoice additional recipients, draft/approved credits, credit note PDF with unique number and SHA, draft voiding before issue, billing schedule records and **manual manager-triggered draft generation only**. No automated issue/send or ledger-level tax compliance.
- Delivery milestone records, submit and acceptance references (cannot mark accepted without evidence).
- Client health history, report-template records, report approval, review action items, executive drilldowns to related records.
- Full fictional Orion demo lifecycle extension (sample schedules, credits, milestone, countersigners, review). Demo values are explicitly fictional and never emailed/signed.
- Dedicated controllers and UI components for new features; existing CRM logic remains intact.

## Not completed / gated

1. **Cross-tenant CRM data isolation.** Legacy account/opportunity/invoice/contact/AI records and all query paths must be migrated to organization scope, followed by adversarial integration tests. New organizations are **SETUP ONLY** by design. No public company user-registration/invitation flow is enabled.
2. Full multi-party signature execution, countersignature envelope finalization, independent immutable/offsite audit evidence, external Google OAuth tests and legal assurance.
3. Tax/VAT rules, issued invoice corrections, credit note accounting integration, automatic scheduled billing issuance, and real automated reminders.
4. Complete delivery/project management and fully configurable MBR/QBR rendering.
5. Live OpenAI/Apollo/Gmail calls, inbound email synchronization, and outbound provider verification.
6. Full Prisma schema validation against a database, TypeScript typecheck, Next/Nest build, browser E2E, and penetration/security tests: **not verified in this container**.

## Installation (Windows development instance)

1. Confirm you have v1.6.3 installed (`docs/RELEASE_V1_6_3.md`). Keep PostgreSQL and Redis running.
2. Make and **verify** a complete PostgreSQL backup. Never include `.env` or data dumps in screenshots or source ZIPs.
3. Stop **all** running Next.js/NestJS Node processes to avoid Prisma engine DLL locking.
4. Extract `Seebot_SalesOS_v1.6.4_Commercial_Workflows_Patch.zip` to a new folder and run `APPLY_SEEBOT_V1_6_4.cmd`; it validates SHA-256 hashes, makes source backups under `.salesos-backups`, and copies only changed files.
5. In the ORIGINAL project directory, inspect `packages/database/prisma/schema.prisma` and run:

```powershell
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd validate --schema=packages/database/prisma/schema.prisma
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd db push --schema=packages/database/prisma/schema.prisma
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd generate --schema=packages/database/prisma/schema.prisma
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

If Prisma reports any destructive database changes, **cancel**. Do NOT pass `--accept-data-loss`. For production, use reviewed and versioned migrations, NOT `db push`.

6. If all checks pass, run `npm.cmd run dev`. In Client Management, create the fully fictional demo lifecycle, inspect Commercial Operations and Delivery. In Company Workspaces, create/setup a separate company profile; confirm its CRM is blocked. Do NOT upload genuine client contracts or invite outside organizations.

## Verification supplied in this release

- Source-level Node test suite: **50 passing**.
- TypeScript/TSX syntax parse: all source files parsed; this is NOT a typecheck.
- Package SHA-256 manifest and ZIP integrity checks.
- Installer and full application build still require Windows verification.

## Development ownership map

- `apps/api/src/workspace/`: organization profile, membership and legacy security gate
- `apps/api/src/commercial/`: amendments, pricing, billing, adjustments, credit note PDF
- `apps/api/src/delivery/`: project milestone records and fictional lifecycle seed
- `apps/api/src/reporting/`: health/review actions and executive drilldowns
- `apps/api/src/signing/`: Google restricted signing foundation, audit verification
- `apps/web/src/components/client/`: commercial operations, delivery, feedback and client success
- `apps/web/app/workspaces/`: company profile/setup and membership UI
- `apps/web/src/components/executive-drilldown-panel.tsx`: leadership record explorer
- `packages/database/prisma/schema.prisma`: newly linked tables and indexes; further isolation migration pending

**Privacy/security notice:** URLs, personal data, account information, signing evidence and invoice data remain sensitive. The new organization setup feature cannot be marketed or opened as a general SaaS until cross-tenant data access is demonstrably secure.
