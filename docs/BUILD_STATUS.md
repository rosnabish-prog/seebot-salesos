# Development status — Milestone 1

## Delivered in source code

| Component | Source exists | Database-backed design | Runtime verified in this environment |
|---|---|---|---|
| Next.js light design system / login | Yes | Login API | No (npm downloads unavailable) |
| NestJS API / Prisma | Yes | PostgreSQL schema | No |
| Create prospect / duplicate guard | Yes | Yes | No |
| Kanban pipeline / stage form | Yes | Yes | No |
| Automatic stage progression | Yes | Transactional workflow | No |
| Per-stage updates / immutable transitions | Yes | Yes | No |
| Contact, activity, proposal, contract forms | Yes | Yes | No |
| Tasks and campaigns (basic) | Yes | Yes | No |
| Sales and CEO dashboards | Yes | Database queries | No |
| Executive trend and stage charts | Yes | Backend data series | No |
| Admin team creation | Yes | Yes | No |

## Known gaps before release

1. **Install dependencies and run builds**. Validate NestJS metadata compilation, Prisma generated types, Next.js production build, and browser UI.
2. **Database migrations**. Generate, review and commit first migration; test with PostgreSQL.
3. **Security hardening**. Rate limiting, MFA, invite/reset and password rotation, user deactivation, session revocation, stronger audit and retention rules, CSP review, CSRF defense-in-depth.
4. **Scope permissions**. Directors/team visibility requires division, membership and resource-policy tables; current role-based model is not enough for production.
5. **Document processing**. Secure object storage, content validation, scanning, signed download links, real contract/approval evidence, file versioning.
6. **Pipeline governance**. Manager override approval workflow (API enforces role/reason but no separate approval request queue), pilot bypass reason and branch states, workflow rule tests, task scheduling and reminder delivery.
7. **Campaign operations**. Prospect enrollment, filters, structured outreach sequence planning, lawful outreach opt-outs, email sync if authorized, attribution.
8. **Dashboards**. Cohort-consistent funnel math, true stage aging and median cycle, optional forecasting, timezone selection, performance comparisons and role-scoped exports. Current period KPI subset is a genuine first implementation, not the complete v1.1 executive scorecard.
9. **Quality**. Integration tests, unit tests, Playwright accessibility/E2E, failure and concurrency tests, alerting, logs, migrations/backups/restore drills.
10. **Deployment**. Production domain, TLS, managed DB, storage, secrets, sender email and verified launch checklist.

## Design corrections from latest request

- Supersedes older v1.1 dark-KPI requirement: **NO dark backgrounds** anywhere in the application.
- All cards white, fine gray strokes, orange accents.
- Trend lines are cubic Bézier paths.
- Stage tracker is Kanban-first and opportunity page uses an 11-step grid, not a flat chronological timeline.
- Saving complete structured evidence or creating supporting records auto-advances exactly one stage through guarded backend logic.

## Definition of done for the next verified milestone

- Running PostgreSQL and web/API locally.
- Admin can log in and create a prospect.
- The saved account is visible after browser reload and different-user login (subject to permissions).
- Stage requirements are enforced by API, auto-progression changes Kanban column, stage notes persist.
- Fake signed contracts cannot move an opportunity to Closed Won; sign-off requires auditable approval/evidence.
- Executive metrics match raw database sample data, no fabricated historical figures.
- Keyboard navigation works for essential flows, and color contrast is tested.
- CI validates build, tests, schema migration and auth regression suite.
