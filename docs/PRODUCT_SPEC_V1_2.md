# Seebot SalesOS — Implementation Baseline v1.2

**Current focus:** Milestone 1 working source code (not production deployment). This document supersedes conflicting dark-card visual rules from earlier requirements.

## Design system — locked

- Light-only layout: `#FAFBFC` page background, `#FFFFFF` cards, fine neutral borders `#E8EBEE`.
- Seebot orange `#FF7A3D` for primary buttons, active tabs, radio/checkbox selections, stage indicators, charts, icons and focus accents.
- Cards use dark **text** for contrast, but **never dark/charcoal filled card backgrounds**. White on bright orange fails typical text contrast checks; use dark labels on orange buttons.
- Dashboard KPI cards: white surface, distinct Lucide icon per metric, measured value, real-data context, optional smooth spline and labeled deltas.
- Stage progress: kanban columns and tiled stage grid, not flat connector timelines. Any date-based trend uses cubic Bézier curves.
- Professional modern density: desktop-first, responsive, appropriate empty/loading/error states, functional click-throughs.

## Business model

- Account = one company, normalized domain. Contact = buyer/stakeholder. Opportunity = particular potential engagement. Campaign = group of prospecting efforts. These entities must not be conflated.
- Create New Prospect creates account and initial opportunity, **current stage** `Account Researched`, status `OPEN / In Progress`.
- Eleven stages: Account Researched; Decision-Maker Identified; Outreach Initiated; Interest Established; Discovery Completed; Pilot Qualified; Pilot Proposed; Pilot Contracted; Pilot Delivered; Production Negotiated; Closed Won.
- Nurture, Unqualified and Closed Lost are outcome statuses, not required forward Kanban columns.
- Account expansion or renewal = new related opportunity, never a forced stage after Closed Won.

## Kanban automation policy

- Saving evidence triggers a server-side validation function. Support records such as contact, outbound activity, proposal or signed agreement also trigger validation.
- A stage may advance **once** when the current gate is genuinely satisfied. A meeting is not considered completed just because it was mentioned in a note.
- Stage visit has evidence JSON, comments, enteredAt/exitedAt and author history. A transition stores from/to, actor, automated flag and reason.
- User drag-and-drop issues a server transition request. It must not bypass stage validation.
- Managers may override skipped or backward stages with a reason; signed production evidence is non-overridable before marking Closed Won.
- Authorship, comments and stage visits are preserved when deals advance, reopen, or move backward.

## Dashboards

**Rep dashboard:** active opportunities, new prospects, due/overdue tasks, proposals, action queue, new-opportunity trend, stage distribution, recent activity. Clicking a row opens the source record.

**CEO/director dashboard:** won count, win rate among decided outcomes, median sales cycle where defined, industry breakdown, signed minimum commitments by ISO currency, new opportunity trends, won-deal spline, bottlenecks, at-risk records, team breakdown. All metrics derived from persisted records; missing amounts are not zero; mixed currencies cannot be summed.

**Data contract:** charts do not render fabricated data. Smooth curves interpolate actual points for display; they do not imply verified measurements between observations. Clearly label date windows, empty states, and as-of timestamp.

## Back-end architecture

- NestJS modular REST API; controller/service separation.
- Prisma/PostgreSQL transactionally consistent opportunity stages.
- Next.js frontend, shared stage definitions and dynamic form field metadata.
- Argon2id password hashes, signed HttpOnly cookie sessions, authorization on API routes.
- Audit event records for record creation, stage evidence changes, transitions, status changes, and comments.
- All dates stored UTC; format in user locale. Values are decimals with currency codes.

## Production gate

**Do not deploy as production yet.** Required next: dependencies installed, migrations reviewed and committed, automated integration tests, invites/forced password rotation and reset, rate limits, MFA, real contract evidence storage, division scoping, source-based reporting permissions, and deploy/restore testing.

## Acceptance scenarios

1. Admin can log in and create another user with valid role; wrong password fails.
2. Sales rep creates a company with a unique website and targeting hypothesis; duplicate domain is blocked.
3. Account creates one initial opportunity at Account Researched; no stage is falsely completed on creation.
4. Rep saves research evidence; auto-advance runs; Kanban reflects Decision-Maker Identified after reload.
5. Verified contact auto-advances to Outreach Initiated; unverified contacts do not.
6. Outreach log plus follow-up date advances; no logged response cannot claim Interest Established.
7. Positive response and documented interest advance; mere comment does not.
8. Pilot proposal status `SENT` and acceptance criteria advance from Pilot Proposed.
9. Signed agreement cannot count without signing evidence. Production stage cannot close won without signed production commitment.
10. Comments persist in stage visit history and remain after auto-progression.
11. Unauthorized representative cannot update another representative's opportunity.
12. CEO can access authorized executive data but cannot create or edit staff users.
13. Deal loss/paused states require reason, and unauthorized reopen is denied.
14. Dashboard counts match database source records and avoid mixed currency summation.
15. Screens use light cards and cubic SVG curves, and keyboard navigation reaches core actions.
