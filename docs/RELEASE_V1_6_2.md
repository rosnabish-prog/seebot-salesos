# Seebot SalesOS v1.6.2 — Feedback and Reminder Workflows

**Compatibility:** Applies to the v1.6.1 Organized Source. This is a development preview; it is **not** a production certificate or a completed multi-tenant release.

## Delivered
- Client survey invitations (NPS 0–10, CSAT 0–5) with 256-bit random single-use links and SHA-256 hashes in the database.
- Demo-only survey links for fictional clients, no messages sent; for real clients a Gmail-backed invitation is *gated* by `SURVEYS_ENABLED=true` and a working authorized Gmail connection.
- Client feedback history, aggregate NPS/CSAT, response submission, and executive NPS detractor alert integration.
- Overdue-invoice eligibility policy and finance reminder review: prepare, managerial approval, preview and explicit sending.
- Invariant re-check at send time for unpaid balance, invoice state and matching approved reminder. No automatic sending; no email when provider is unconfigured.
- Fictional reminder preview for demo invoices; no emails or accounting side effects.
- Integration-status API and administration panel. It reports readiness, never secrets; OpenAI and Apollo remain DEMO providers.
- KPI definitions and interactive chart explanations on hover or keyboard focus.
- Tests for survey scoring, reminder gates and provider status.

## Not delivered / must stay disabled
- Multi-company independent CRM workspaces or public signup: **NOT READY**. Earlier ORM queries are Seebot-wide and do not enforce tenant data isolation. Do not enable public company onboarding.
- Live OpenAI/Apollo, inbound Gmail reply sync, automated emailing, e-signature production legal/security acceptance, MBR/QBR PDF generation, invoicing system accounting integration.
- No statement that all outstanding v1.6 features have been completed. This is the next verified source-level iteration.

## Setup
1. Back up PostgreSQL with `pg_dump` and verify the backup is nonempty, then stop all SalesOS Node processes. Keep PostgreSQL/Redis running.
2. Extract **the patch ZIP** to a new folder, run `APPLY_SEEBOT_V1_6_2.cmd`, choose your existing project root and read the installer output.
3. In your existing project root, run the Prisma schema update **separately**:
   ```powershell
   .\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd db push --schema=packages/database/prisma/schema.prisma
   .\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd generate --schema=packages/database/prisma/schema.prisma
   npm.cmd run typecheck
   npm.cmd run test
   npm.cmd run build
   ```
4. STOP if Prisma warns about destructive changes or asks for a reset. Avoid `--accept-data-loss`.
5. Restart `npm.cmd run dev`; check `http://localhost:3000/clients`, open a fictional client and go to **Feedback**. Generate a local demo survey and submit. Under **Invoices**, preview a fictional reminder. In **Team & Settings**, review API status.
6. Leave `SURVEYS_ENABLED=false` for now; it can be set to true only after Gmail, HTTPS public origin, recipient validation and privacy controls are tested.

## Security notes
- A survey link is for feedback collection, **not identity verification** for signatures. Never send fictional clients' data to real customers.
- The financial reminder flow is approval-based, not unattended automation. Real email sending is still gated by existing Gmail checks. Outgoing status is not equivalent to proof of delivery.
- This preview stores client contact data; adopt retention and authorization policies before real external surveys.
- The latest account and billing schema remain single-organization scoped. **Do not onboard independent organizations** until all legacy routes and background queries are tenant-scoped and penetration tested.

## Testing limitations
Static source parse, 31 pure source tests and ZIP integrity have been checked in a local container. Dependencies and PostgreSQL were not available for a full Prisma generate, Next/Nest build, live OAuth, browser E2E or actual database migration. Your local CI checks are a deployment blocker.
