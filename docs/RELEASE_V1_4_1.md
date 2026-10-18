# Seebot SalesOS v1.4.1 — Unified AI Opportunity Workspace

This update installs into **an existing v1.4 SalesOS project**. It does not reset PostgreSQL, change login credentials or activate live OpenAI, Apollo or Gmail. All generated research and messages remain explicitly DEMO.

## What's included
- 11-stage horizontal timeline on the Opportunity Workspace.
- Whole-form AI mock suggestions, per-field mock suggestions, safe apply-to-empty-fields, individual field replacement and manual editing.
- Persisted `Save Draft` independent of `Save & Validate` and Kanban transitions.
- Editable employee context, feedback/revision requests, saved draft versions, and opportunity-wide planning blueprint.
- Company research, fictional lookalikes, existing-contact ranking, email drafting, revisions and simulated conversation timeline **within** the Opportunity Workspace.
- Old Intelligence URLs redirect to Prospects/Opportunity Workspace; sidebar Intelligence item removed.
- New Prospect creation requires company name, website and industry; hypothesis is optional.
- Guard preventing the built-in unverified example research summary from counting as stage-completing verified evidence.

## 1. BACK UP YOUR DATABASE FIRST

Open PowerShell in your existing `seebot-salesos` directory. Keep PostgreSQL and Redis running.

```powershell
docker compose exec -T postgres sh -c 'pg_dump -U seebot -d seebot_salesos -f /tmp/salesos_pre_v141.sql'
docker compose cp postgres:/tmp/salesos_pre_v141.sql "$env:USERPROFILE\Documents\salesos_pre_v141.sql"
Get-Item "$env:USERPROFILE\Documents\salesos_pre_v141.sql"
```

Confirm the file has a nonzero size and keep it private. If your database service or credentials differ, use your actual settings.

## 2. Stop both running app processes

Use Ctrl+C in every PowerShell / VS Code terminal running `npm.cmd run dev`. **Do not stop Docker/PostgreSQL.**

## 3. Install the patch

1. Unzip this archive into a **new separate folder** (do not mix with old patch folders).
2. Double-click `APPLY_SEEBOT_V1_4_1.cmd`.
3. Wait for the success message. The installer checks that you're updating a v1.4 project, backs up changed files, uses **literal** file paths for Next.js `[id]` folders, and never touches `.env` or your database.
4. Optional alternative for relocated projects:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\APPLY_SEEBOT_V1_4_1.ps1 -ProjectRoot 'C:\path\to\seebot-salesos'`

## 4. Update the database schema and regenerate Prisma

The code adds the `OpportunityStageDraft` table with an opportunity and stage unique key. **This is separate from the source installer.** Run in your project directory:

```powershell
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd db push --schema=packages/database/prisma/schema.prisma
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd generate --schema=packages/database/prisma/schema.prisma
```

If Prisma asks to reset the database, reports destructive modifications, or shows any unexpected schema change: **decline and stop**. Do not use `--accept-data-loss`. Existing tables must remain intact.

## 5. Verify and start

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run dev
```

Open `http://localhost:3000`, select an opportunity and use the Stage Workspace, Company Research, Contacts, or Outreach & Conversations tabs. A port-in-use error (3000/4000) indicates a previous web/API process is still running; it is not a database failure.

## Acceptance test

1. Create a prospect with name, website and industry only.
2. Open its Opportunity Workspace; timeline highlights Account Researched.
3. Click **Generate entire stage**. Review the DEMO suggestions; source citation deliberately stays empty until entered from a real source.
4. Click **Fill empty fields**; hand edits must remain untouched. Use **Suggest this field** on an individual field.
5. Enter a real, verified research source and revise the sample summary as appropriate. Click **Save draft**; ensure the Kanban stage does not change. Refresh, then **Restore saved draft**.
6. Click **Build full opportunity plan**. All 11 steps are shown as a planning blueprint, with future milestones not marked completed.
7. Enter instructions in **Tell AI what to change**; in DEMO, only simple formatting updates are possible, otherwise feedback is recorded and the fields remain unchanged.
8. When evidence is complete and verified, click **Save & Validate stage**. The existing backend must perform the stage transition if and only if its gate conditions are satisfied.
9. Check Company Research, Contacts, and Outreach & Conversations for existing v1.4 demo data. No external email is sent.

## What has been tested here

- All app TypeScript/TSX sources parsed with TypeScript: **syntax pass**.
- The original 9 tests and 5 new demo/provider safety tests: **14 passing**.
- ZIP member paths and internal integrity validated.
- A complete Next.js/NestJS typecheck, actual Prisma db push, and Windows/browser acceptance tests **have not been run here** because project dependencies and live database are not available in the build environment. They must pass on your workstation.

## Limits of this release

Live OpenAI, Apollo and Gmail integrations are **not** active. Mock research cannot establish verified facts; mock contact suggestions do not fetch Apollo people, and Gmail sending is simulated. Full opportunity generation produces a **plan**, not fabricated proof of meetings, emails, signed agreements, deliverables or client acceptance. Some stage transitions depend on structured contact/activity/proposal/contract records, not simply text fields.
