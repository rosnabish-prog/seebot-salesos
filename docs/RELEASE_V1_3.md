# Seebot SalesOS v1.3 — Change Log and Upgrade Guide

**Release type:** Internal development preview — not certified for production.
**UI:** Light only · Seebot orange #FF7A3D for branding · deeper #C2410C for white-on-orange primary actions · Afacad via Google Fonts (network required; local fallback font provided by the browser).

## What's included

- Replaces the placeholder logo with a clean crop of the Seebot wordmark supplied for this release. The source image was clipped on the left, so an uncropped original SVG is still preferred.
- Afacad typography and refined form focus styles, unified dropdown arrows, click-through breadcrumbs, page fades, subtle hover effects, Bézier spline chart animation, progress indicators in Kanban, and loading skeletons.
- Each new prospect continues to create an Account and a linked Opportunity at **Account Researched**; v1.3 also creates an assigned research task and a task for each subsequent active stage. Finishing the validated requirements automatically advances the card.
- New Industries table; administrator can add and archive industries. The archived industry remains on existing account records and past reports.
- Sales campaign-to-account enrollment; campaign cards display enrolled companies. These are sales prospecting programs, *not* ad campaigns. No automated mailing is claimed.
- Roles & Permissions reference matrix. Not editable as arbitrary role definitions. Director division restrictions remain a production backlog item.
- Profile page enables self-service password changes with session invalidation; account admin password rotation is now possible without modifying database records manually.
- Handles empty dashboards with guidance and zero-data charts; replaces generic plus icon with meaningful empty-state icons.
- Seed script now preserves `$` and other special password characters using `dotenv --no-expand`.

## Upgrade your EXISTING Windows installation (preserve data)

1. In your existing development terminal, stop `npm.cmd run dev` using **Ctrl+C**. Leave Docker Desktop running.
2. Back up your PostgreSQL database before making schema changes. In your existing project directory run:

   ```powershell
   docker compose exec -T postgres pg_dump -U seebot -Fc -f /tmp/seebot-before-v13.dump seebot_salesos
   docker compose cp postgres:/tmp/seebot-before-v13.dump .\seebot-before-v13.dump
   ```

   If these commands fail, **stop and investigate; do not proceed without a backup if you have valuable data**.
3. Extract the downloaded v1.3 ZIP. It contains `UPDATE_SEEBOT_WINDOWS.cmd` and the `seebot-salesos` source folder. Double-click **UPDATE_SEEBOT_WINDOWS.cmd**. This script merges new source files into the original project folder shown in your earlier screenshots, **without deleting existing files** and excluding `.env`, `node_modules`, and generated build folders. Inspect the script if your project location is different.
4. Open **Windows PowerShell** inside your original project folder and run:

   ```powershell
   npm.cmd install
   npm.cmd run db:generate
   npm.cmd run db:migrate
   ```

   If prompted for a migration name, enter `salesos_v1_3`. This adds Industry, CampaignAccount and the passwordVersion field; it must not reset existing accounts, opportunities or other records.
5. Run `npm.cmd run db:seed` **after the migration** to populate default industries. Existing administrator password is not reset by seeding.
6. Start with `npm.cmd run dev`. Once both `[api]` and `[web]` are ready, visit `http://localhost:3000` and sign in using your existing administrator account.
7. In **My Profile**, change your previously exposed password. Also replace the previously exposed `JWT_SECRET` inside `.env` with a fresh 64-character random value **before starting the upgraded services**, then sign in again. Do not share `.env` screenshots.

### Important constraints
- This is an additive migration. Do **not** run `docker compose down -v`, `prisma migrate reset`, or `prisma db push --force-reset`; those actions can remove your saved data.
- Never overwrite `.env` with `.env.example` during upgrades.
- A 27-finding npm audit was previously reported by your local environment. Those packages still require dependency review and remediation before production deployment.
- We cannot claim end-to-end verification of database migrations or front-end application build in this packaging environment because dependency download/install timed out. TypeScript source parsing and existing stage tests passed.
- Full procurement/invitation/MFA/security hardening, production email sequences, signed documents upload and comprehensive permissions require further engineering.

## Fresh installation

Follow the included README but make sure to create a secure `.env`, run Docker for database services, install dependencies, generate Prisma, run an initial migration, seed, then start dev. Run only in a trusted local network until security and dependency checks pass.

## Recommended acceptance test (after startup)

1. Confirm logo, Afacad rendering (with internet access), primary button white text and consistent dropdown styling.
2. Go to Settings > Industry Management, add an industry, then verify it appears in New Prospect.
3. Create a prospect; confirm Research column Kanban card and first `Stage:` task in Tasks.
4. Complete required Research evidence and confirm the stage moves to Decision-Maker Identified; verify its next stage task was created.
5. Create a Sales Campaign, enroll that account, and verify membership count.
6. Open CEO/Director summary, change reporting period, and verify empty-state behavior as appropriate.
7. Open My Profile, rotate the exposed password, and verify you must sign in again.
