> **v1.6.5 DEVELOPMENT PREVIEW:** Account tenant ownership, sequential signing evidence and receivables corrections. This is NOT public multi-tenant or production-ready. Read [docs/RELEASE_V1_6_5.md](docs/RELEASE_V1_6_5.md).

> **v1.6.4 Commercial & Workspace Setup preview:** Read [docs/RELEASE_V1_6_4.md](docs/RELEASE_V1_6_4.md). Organization setup is supported, but public multi-company CRM remains disabled until tenant isolation passes security tests.

> **v1.6.3 Offline Client Success:** See [docs/RELEASE_V1_6_3.md](docs/RELEASE_V1_6_3.md) for the new MBR/QBR PDF, client health, renewal tasks, multi-line invoices, local reminder review and critical security limitations.

> **v1.5 Preview:** See [Unified Client Lifecycle release notes](docs/RELEASE_V1_5_PREVIEW.md) for installation, demo client management, contract document storage, invoices and executive reporting.

> **v1.3 release notice:** If upgrading an existing Windows installation, read [docs/RELEASE_V1_3.md](docs/RELEASE_V1_3.md) first, back up PostgreSQL and use `UPDATE_SEEBOT_WINDOWS.cmd` from the ZIP root. Do not overwrite `.env` or reset the database. This is a development preview, not a production release.

# Seebot SalesOS — First Working Development Milestone

## Run in GitHub Codespaces (private development preview)

1. Open the repository's **Code → Codespaces** tab, start a Codespace from `feature/ci-isolation-finance-audit`, and open a new Bash terminal.
2. If the Codespace is on `main`, switch to the feature branch first. Untracked generated `package-lock.json` is harmless.
3. In the repository root, run `git pull --ff-only` and then `bash scripts/start-codespaces.sh`.
4. The helper creates a private `.env` on first use, generates random test credentials, starts Docker PostgreSQL/Redis, applies the schema to the disposable preview database, seeds the admin and starts both servers.
5. In the **Ports** tab, ensure port **3000** has **Private** visibility and open its forwarded HTTPS URL. The API is proxied on the same origin under `/api` and does not need a public port 4000.
6. Log in with the local admin email/password shown by the script. Do not paste that password into a chat, issue or commit. The environment and credentials are for a development preview, not a production deployment.

**Prerequisites:** Codespace must support `docker info` (Docker daemon and Compose). The helper refuses to continue if Docker is unavailable, to avoid a partial database setup. Existing `.env` admin credentials are preserved. The script always keeps Google self-registration, external signing, and Gmail delivery disabled. Creating a new Google-only user requires a separately configured Google OAuth client and an explicit, audited opt-in; it is not enabled by this helper.

**Security:** Codespaces forwarding is an authenticated development preview. Keep forwarded ports private and do not put real customer, payment or signing data in this deployment. The local `prisma db push` is only for a disposable PostgreSQL database, never production.



A **real full-stack implementation scaffold and vertical slice** for Seebot's private B2B sales operations app. It uses the user's approved light-theme screenshot layout, Seebot orange (`#FF7A3D`), a Kanban-first pipeline, comments, evidence-based automatic stage advancement, and dashboards with smooth cubic Bézier trends.

> **Status: development milestone, NOT a production release.** The source code was created in a restricted environment with no network access to npm and no Docker runtime. Dependencies could not be installed, the database migration could not be executed here, and live end-to-end testing has **not** been completed. See `docs/BUILD_STATUS.md` for what is functional in source versus incomplete.

## Stack

- Next.js 15 + React 19 + TypeScript frontend, responsive light-theme CSS and Lucide icons.
- NestJS 10 + TypeScript REST API, cookie-based login and access checks.
- PostgreSQL 16 + Prisma ORM, append-only stage visits/transitions, persistent comments.
- Optional Redis container reserved for future notification / background jobs.
- npm workspaces monorepo with a shared stage-definition package.

## Quick start (developer machine with Node 20+, npm, Docker)

```bash
# from repository root
cp .env.example .env
# IMPORTANT: edit .env; set strong unique JWT_SECRET and ADMIN_PASSWORD.
# For example, generate secrets using a cryptographic password manager.

docker compose up -d postgres redis
npm install
npm run db:generate
npm run db:migrate       # first run will ask for the migration name
npm run db:seed          # bootstraps ADMIN_EMAIL (safe to rerun)
npm run dev
```

Visit **http://localhost:3000** and log in using the credentials you configured in `.env`.

The API runs on **http://localhost:4000/api**. Health check at **http://localhost:4000/health**.

**Database migration:** This initial repository contains the schema but not a pre-generated migration. Run `npm run db:migrate` on your development environment; review and commit generated migrations before production use. Never use `prisma db push` as a production migration workflow.

### Demo data

Set `SEED_DEMO_DATA=true` only when you want an explicitly fictional demonstration account. The seed uses `example-vision.invalid` and does not pretend real companies are Seebot customers.

## Implemented source workflows

1. Admin-created email/password users with server-side Argon2id hashes, role assignment, and HttpOnly session cookies.
2. Create prospect -> normalized-domain duplicate check -> account + initial opportunity + first stage visit.
3. Kanban board across eleven stages, drag to request a validated transition, list view, account detail.
4. Dynamic stage evidence forms. Saving all required evidence triggers *automatic* movement to the next stage.
5. Non-form gates: verified contact, logged outreach, positive response, sent pilot proposal, signed pilot SOW, accepted pilot results, and signed production agreement.
6. Each stage visit has comments and timestamps; old stage history stays intact.
7. Log contacts, outbound activity, responses, proposals, and signed contract metadata.
8. Pause/nurture or close lost with reason; manager reopening and audited stage override on API.
9. Tasks, follow-ups, campaign records and admin team directory.
10. Live database-backed rep and executive dashboards, KPI cards, Bézier trend charts and stage/industry distributions.

## Auto-advance examples

- **Account Researched**: company research summary, service hypothesis, source, and next action all saved -> moves to Decision-Maker Identified.
- **Decision-Maker Identified**: verified contact with role, source and business contact channel -> moves to Outreach Initiated.
- **Outreach Initiated**: follow-up date saved **and** an outbound activity logged -> moves to Interest Established.
- **Interest Established**: positive response logged **and** interest details saved -> moves to Discovery Completed.
- **Pilot Proposed**: a proposal with fee, criteria, and SENT/ACCEPTED status -> moves to Pilot Contracted.
- **Production Negotiated**: commercially documented terms and signed production agreement with minimum commitment -> Closed Won. Managers cannot bypass signed-production evidence.

Automatic advancement is processed inside a Prisma serializable transaction using an optimistic version check, with transition history recorded for audit.

## Repository map

```text
apps/
  web/       Next.js login, dashboard, executive, prospects, pipeline, opportunity workspace, tasks, campaigns, settings
  api/       NestJS controllers, workflow service, authorization, analytics
packages/
  shared/    11 pipeline stages and metadata for dynamic evidence forms
  database/  Prisma schema and admin seed
infrastructure/ deployment guidance
.github/     planned CI example
 docs/       architecture, status, remaining work, acceptance checklist
```

## Important security limitations (pre-production blockers)

- **No invitation email or password reset yet**. Admin creates users with a temporary password; do not roll out real users until enforced rotation/reset is implemented.
- **No MFA**. Add for leadership and admin accounts before production.
- **No login attempt rate limiting or lockout**. Add and test before internet exposure.
- **No verified file upload pipeline**. Contract evidence is a manually entered reference, not an uploaded/verified signature; production signing/approval evidence must be validated.
- **No fine-grained director/department scoping**. Managers/directors currently use global reads; implement scoped permissions before granting such roles to isolated divisions.
- **No outbound email integration, notification worker or campaign automation**. Activity logs are entered manually.
- **No export/redaction/retention management or secure object storage yet**.
- Tests, coverage and staging deployment are **not complete**; see `docs/BUILD_STATUS.md`.

## Product-specific design decisions

- All major panels and KPI cards are **white/light**; orange icons, active states, CTAs. Text on white cards is charcoal for readability. White text on the bright orange `#FF7A3D` is inaccessible for normal body text.
- Charts use smooth cubic Bézier curves, never abrupt point-to-point trend lines. Stage progress is a grid of steps, not a flat timeline.
- `Closed Won` is the last stage. Account expansion is a separate future opportunity, not a forced stage after closing.
- Estimated pipeline values and signed commitments are never mixed, and different currencies are displayed separately.

For detailed routes and scope, see `docs/API_REFERENCE.md` and `docs/PRODUCT_SPEC_V1_2.md`.

## Next milestone

Complete installation and local runtime smoke tests; then implement secure staff invitation/reset, genuine file storage, role scoping, drag/transition workflow tests, campaign-prospect membership, and production-grade observability and backup verification.


### v1.6.2 Preview
See [`docs/RELEASE_V1_6_2.md`](docs/RELEASE_V1_6_2.md) for the NPS/CSAT invitation, overdue invoice reminder and integration readiness workflows, limitations and migration procedure.
