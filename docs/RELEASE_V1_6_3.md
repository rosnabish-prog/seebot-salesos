# SalesOS v1.6.3 — Offline Client Success & Finance Workflows

**Release type:** Source preview on top of **v1.6.2**. No external API keys required to exercise the features below. The installer copies source only; it never updates the database, sends mail, or changes credentials.

## Features added

1. **Client health indicator:** transparent rule-based health summary from the latest NPS/CSAT evidence, unresolved severe issues, unpaid overdue invoices, and imminent signed-contract expirations. Each alert names the underlying recorded signal. It is advisory, not a predictive AI churn score.
2. **MBR/QBR report generation:** select a reporting period (up to 100 days); snapshot client CRM, commercial records, feedback including survey replies, issues, contracts and suggested internal follow-ups in PostgreSQL; download an immutable-snapshot PDF. All demo data remains marked FICTIONAL. Users must check and approve reports before distributing.
3. **Renewal review planning:** signed contracts with expiry dates can generate a renewal plan plus an assigned task, without duplicating open renewal tasks. Not an automatically executed contract renewal.
4. **Multi-line invoice draft editor:** enter many volume/hour/fixed lines and optionally pull approved rate lines from a selected contract. An invoice retains a collapsible line breakdown. The server still validates line amounts and recalculates the total. Issued invoice PDF records remain unchanged.
5. **Overdue automation dry run:** leadership can preview day-1 and day-5 overdue milestones, create idempotent approval records and internal review tasks. **No email is sent**; live payment status and later Gmail delivery remain distinct.
6. **Executive automation panel:** review unpaid invoices and create tasks from the Executive Overview.
7. **Build fixes:** `use client` directives are once again at the top of relevant Next.js client components.
8. **Modularity:** separate NestJS `client-success` and `invoices` logic plus small React panels under `components/client`.

## Not implemented by this patch — important blockers

- **Public multi-company onboarding, active workspace switching, and cross-tenant data isolation.** Earlier record access paths remain single-organization. Do not enable external company registrations or give unrelated companies accounts in this deployment. Completing isolation requires migrations and a thorough tenant-scoping review of **every** controller, worker and file endpoint.
- Live OpenAI/Apollo research, actual Gmail reply synchronization, Google OAuth live verification, legally dependable self-hosted electronic signing, provider-authenticated delivery, and real scheduled outgoing reminders. Provider stubs/settings are preserved; no dummy data is presented as live evidence.
- Automated PDF distribution or client-facing acceptance of MBR/QBR; only internal download is implemented.
- Production build, migration, external browser tests and security review; local source tests are not a substitute.

## Upgrade on existing Windows installation

1. Start from v1.6.2; back up PostgreSQL using a verified `pg_dump` archive, copying it outside the SalesOS folder. Ensure Docker PostgreSQL/Redis remain running; stop the Next and Nest Node processes.
2. Extract the v1.6.3 patch, run `APPLY_SEEBOT_V1_6_3.cmd`, select the existing project folder if prompted. The script validates file hashes and copies prior source to `.salesos-backups`.
3. From the original project folder, inspect the schema diff, then run:

```powershell
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd db push --schema=packages/database/prisma/schema.prisma
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd generate --schema=packages/database/prisma/schema.prisma
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run dev
```

Stop if Prisma asks to reset or drop data. Do not use `--accept-data-loss`. The `db push` step is for this **local development preview only**; production use requires a reviewed, versioned migration.

## Test acceptance

- Open `/clients`, generate a fictional Orion Vision Labs account if not already present. Under **Reviews & Health**, generate both MBR and QBR snapshots, download PDFs and confirm they include the DEMO warning, scores and client issues.
- Record an NPS detractor or issue and confirm the client-health score and flags change on refresh.
- For a fictional signed contract with expiry date, schedule a renewal and verify exactly one outstanding renewal task.
- Under **Invoices**, create a draft with two or more lines, check the backend total and collapsible breakdown. Select a contract and import its rate line if present.
- In **Executive Overview**, preview overdue reminder milestones and create internal approval tasks. Confirm that no emails are sent, and repeating the action does not create duplicate milestone events.
- Verify that adding/editing a contact in Client Management updates the same account used by Opportunity Workspace.
- Test client access restrictions; an employee must not download a client report for an unauthorized account.

**Do not process genuine signed documents, invoices or independent third-party organization data in an unverified build.**
