# Seebot SalesOS v1.5 Preview — Unified Client Lifecycle

**Internal Seebot only.** Applies to v1.4.1, preserves existing records. Source preview with manual commercial operations, not a live e-signing/accounting/email system.

## What's implemented

1. **Prospect → client continuation:** The existing Closed Won transition updates the same Account to Customer and records `clientSince`. The Closed Won opportunity links to `/clients/:accountId`. Client Management lists customer accounts and shares original Account / Contact / Opportunity records. Add a POC on either screen and the same contact is visible on both.
2. **Deal estimate & tasks:** Edit potential pipeline value and currency from an open Opportunity. Create tasks with an optional datetime directly in Opportunity Workspace and edit existing task title, description, and due date in Tasks & Follow-ups.
3. **Contracts:** Existing opportunity-created agreements show in the client workspace. Private PDF upload (max 10 MB), SHA-256 hash, role-checked download, manager verification and final manual signed confirmation, with event timeline and audit logging. Signature due/expiration dates supported; manually verified executed PDF required for *new* signed confirmations. Legacy signed records remain. There is **no outbound e-signature delivery or actual signature service** in this release.
4. **Invoices:** Draft one-line invoices, internal approval, record evidence of external sending, manual receipt/partial payment, balances, overdue status computed by due date, and day-5 reminder **approval tasks**. No invoice PDF generation, no Gmail sending, no automated real reminders or reconciliation yet. This is an internal invoice register; legal invoice requirements must be verified before use as an official billing system.
5. **Client health:** Manual NPS (0–10), CSAT (0–5), MBR, QBR and client issue records. Reviews, escalations and payment alerts appear in the client overview.
6. **Executive commercial data:** By-currency potential pipeline, signed commitment, invoiced, recorded collection, receivables, overdue balances; overdue invoice/contract-signature alerts, expiring agreements, NPS detractors and serious issues; quarterly reporting, 6-month and custom date range. Demo amounts are excluded from actual metrics, with an explicit demo-only toggle for commercial sections.
7. **Safe demo data:** One admin-triggered fictional account `DEMO · Orion Vision Labs (fictional)`, with 3 fictional POCs, a fictional closed-won opportunity, demonstration signing events, a paid/overdue/upcoming invoice, a low NPS and an MBR, plus an issue. The scenario is idempotent, uses `.example` contacts, and the records are tagged isDemo=true. The UI and financial reports label synthetic content.
8. **AI test fixtures:** Stage assistant can now suggest clearly marked fictional client change requests, and accept simple simulated revisions. The backend refuses to advance based on fields containing `DEMO ONLY`/`DEMO_ONLY`.

## Limitations that matter

- The live signing provider, real signer invitation and verified third-party signature certificates are **not connected**. Manual document verification is not equivalent to a legal e-signature service.
- Gmail OAuth, email sending/reply sync, invoice delivery/reminders, banking and accounting reconciliation, invoice PDF generation, survey link distribution and scheduled MBR sharing remain later phases.
- `record externally sent invoice` requires a user-entered sending reference; recording an external send is not actually emailing the client.
- Currency values are never summed across currencies; revenue figures show *recorded payments*, **not** formal revenue recognition.
- Contract PDFs reside on the backend's private disk, **outside `public/`**. Set `DOCUMENT_STORAGE_DIR` to a stable and secure location if running beyond local development, and back up this directory independently of PostgreSQL. Do not include these files in project ZIPs or Git. Audit access and plan encryption, malware scanning, secure retention and storage backups before real contracts are entrusted to this preview.
- UI/security code is not a substitute for finance, tax, contract or data-protection review.

## Installation, Windows

### 1. Back up PostgreSQL **and private uploaded documents**

In PowerShell inside the existing project, **leave Docker/PostgreSQL running**:

```powershell
docker compose exec -T postgres sh -c 'pg_dump -U seebot -d seebot_salesos -Fc -f /tmp/salesos_before_v15.dump'
$pg = docker compose ps -q postgres
docker cp "${pg}:/tmp/salesos_before_v15.dump" ".\salesos_before_v15.dump"
Get-Item ".\salesos_before_v15.dump" | Select-Object Name,Length
```

Confirm the backup is **nonzero**. A `WARN "h" variable is not set` message is from Docker Compose variable expansion and does not by itself establish dump failure; fix the underlying Compose `$$` escapes separately. Keep your backups outside any ZIPs you share. If you already uploaded PDFs in a previous build, back up that private storage directory as well.

### 2. Stop Node app, not PostgreSQL

Stop all running `npm.cmd run dev` processes using Ctrl+C, otherwise Prisma generate may fail on Windows with `EPERM`.

### 3. Install the source patch

Unzip into a new folder and run `APPLY_SEEBOT_V1_5_PREVIEW.cmd`. The installer validates the destination, checks all source files exist first, uses **literal paths** for `[id]` Next.js directories and creates a timestamped source backup before copying. It never changes `.env`, `node_modules`, private documents, or the database.

Default project path:
`C:\Users\user\Downloads\Seebot_SalesOS_Milestone_1_Source\seebot-salesos`

For relocated projects: `powershell -NoProfile -ExecutionPolicy Bypass -File .\APPLY_SEEBOT_V1_5_PREVIEW.ps1 -ProjectRoot "C:\other\seebot-salesos"`

### 4. Apply schema only after backup

```powershell
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd db push --schema=packages/database/prisma/schema.prisma
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd generate --schema=packages/database/prisma/schema.prisma
```

If Prisma reports destructive changes, asks to reset, or drops existing content, **decline** and share its output. Never use `--accept-data-loss`. For production use, create and review proper migration SQL instead of routine `db push`.

### 5. Verify and start

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run dev
```

**Do not launch further steps if typecheck/tests fail.** Open `/clients`, optionally seed the fictional demo scenario (manager role), view `/clients/:id`, edit task due dates and test the executive range/quarterly panels.

## Suggested acceptance tests

- Create a prospect, follow existing stage progression with verified evidence to Closed Won, and confirm account shows in `/clients`. Existing contacts should appear; new client POCs should appear back on the opportunity.
- For safety, use the demo scenario instead of generating fictional signing events in real clients.
- Load the fictional demo, inspect overdue invoice and low NPS; verify demo values are **not** in actual financial totals, only in the separately labeled demo report.
- Create a task with a due date on an opportunity and edit the date in Tasks.
- Generate `DEMO ONLY` suggestions; Save Draft works, but saving demo text as real stage evidence **must fail**.
- Record a draft agreement on a real account (manager), upload a real executed PDF only with appropriate authorization, verify it, and confirm real signing date. Then check stage progression and the shared Client Workspace.
- Test partial invoice payments and ensure invoice remaining balance is correct; overdue reminder action creates an internal approval task, **not** a client email.
- On executive page, test 6 months, Custom range, Quarterly Commercial Performance, contract alerts and NPS alerts.

## Validation in package build environment

- 14 pre-existing automated Node source-level tests passed.
- TypeScript parser reports zero syntax errors across current source.
- ZIP integrity verified.
- **Full NestJS/Next.js dependency-based typecheck, actual Prisma schema push, Windows installer run and browser end-to-end acceptance have not been performed here.** The patch is a development preview, not a production-certified release.
