# Seebot SalesOS v1.4 — AI Intelligence Foundation (DEMO Preview)

This is an **internal Seebot development release**, not a live OpenAI/Apollo/Gmail integration. All external-provider features remain disabled by design; no production keys are required.

## Implemented
- `AI Intelligence` navigation and account index; link to each account's workspace from Prospects.
- Saved account research outlines and fictional lookalike examples (explicit DEMO warnings).
- Rank existing CRM contacts with a deterministic title heuristic; suppression honored.
- Generate demo email drafts for already-stored, email-addressed contacts; manual edits, prompt-style mock revisions and version history in PostgreSQL.
- Simulated send (database-only, **no external email, no CRM outreach activity**) and synthetic reply entry with heuristic classification and suggested next actions; no automatic stage movement.
- Auth and owner checks on all new routes; input length validation; admin/read-only roles cannot mutate intelligence.
- Provider configuration availability endpoint that does **not** reveal secrets and truthfully reports `liveEnabled: false`.
- Additive Prisma tables: `IntelligenceRun`, `OutreachDraft`, `OutreachRevision`, `OutreachMessage`.
- Light UI consistent with Seebot branding.

## Intentionally NOT active
- OpenAI model calls, real web research, real competitors, Apollo search/enrichment.
- Gmail OAuth, real sending, mailbox syncing, Gmail watch/Pub/Sub, outbound sequences.
- Automatic pipeline advancement from a demo reply.
- Live mail delivery, scheduling, provider rate/credit tracking and mailbox consent management.

These require provider account configuration, secure token storage, substantial integration code, and live end-to-end testing. Do not interpret a green demo state as a live integration.

## Upgrade
1. **Back up your PostgreSQL database** before changing the schema. Run these commands from the existing SalesOS folder in PowerShell (store the resulting SQL file securely; it contains private CRM data):

   ```powershell
   docker compose exec -T postgres sh -c 'pg_dump -U seebot -d seebot_salesos -f /tmp/salesos_pre_v14.sql'
   docker compose cp postgres:/tmp/salesos_pre_v14.sql "$env:USERPROFILE\Documents\salesos_pre_v14.sql"
   ```

   Verify the file exists and is nonempty. Do not share the backup, `.env`, secrets, or tokens.
2. Close the app in terminals (Ctrl+C).
3. Extract the `v1.4` ZIP to a new folder; run `APPLY_SEEBOT_V1_4_PREVIEW.cmd`. It updates source files only and creates a timestamped source backup. It does not change `.env` or the database.
4. In your existing Seebot project folder, run (PowerShell):

   ```powershell
   # No npm install needed if v1.3.3 already runs successfully.
   .\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\\node_modules\\.bin\\prisma.cmd db push --schema=packages/database/prisma/schema.prisma
   .\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\\node_modules\\.bin\\prisma.cmd generate --schema=packages/database/prisma/schema.prisma
   npm.cmd run typecheck
   npm.cmd run dev
   ```

   If `prisma db push` asks to perform a destructive change or reset the database: **decline**, stop and ask for migration help. Never run `--accept-data-loss` or `--force-reset`. Before production, replace `db push` with a properly reviewed migration baseline.
5. Open `http://localhost:3000/intelligence` and select an existing prospect.
6. Add a contact with a work email in the opportunity's Contacts area before generating a demo email draft.

## Smoke test
- Create a research outline and review it; existing stage evidence should not change.
- Generate fictional lookalikes; they must have `.example` domains.
- Rank existing contacts; opted-out contacts must not be contactable.
- Create draft -> edit -> save -> revise -> inspect version history.
- Simulate send -> Conversations -> submit synthetic reply -> view analysis.
- Check that no real email was sent and no Kanban card auto-advanced.
- Test a read-only user's access: can view owned/authorized records but must not mutate.

## Validation limits
- Static TS/TSX syntax checks and source-level tests can run in the packaging environment.
- No dependencies or PostgreSQL server available here for full Nest/Next build or database integration test. User's installation must verify `typecheck`, migration and the browser flows.
