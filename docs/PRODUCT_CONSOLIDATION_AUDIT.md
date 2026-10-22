# SalesOS Product Consolidation Audit

**Branch:** `feature/ci-isolation-finance-audit`  
**Purpose:** canonical product architecture after consolidating legacy Seebot CRM features with independent company workspaces.

This document is a source-level product audit, not a production certification. A feature marked **Operational in preview** is wired through tenant-scoped API + UI and covered by project tests where noted. Provider-dependent features remain explicitly gated until their external systems are configured and independently validated.

## 1. Canonical user journey

1. **Login** — work email/password or configured Google sign-in.
2. **Two-factor verification** — mandatory on every sign-in. Email one-time code; Codespaces uses private Mailpit.
3. **Workspace resolution**
   - zero memberships -> company setup;
   - one membership -> select automatically;
   - multiple invited memberships -> workspace chooser.
4. **Company setup** — only company name is mandatory. Website/industry/country/currency/timezone can be completed later.
5. **Optional team invitations** — comma/Enter email chips, removable before sending.
6. **My Dashboard** — permanent landing page after setup.
7. **Sales flow** — Prospect -> Opportunity -> configured 11-stage Pipeline.
8. **Client relationship begins at Pilot Contracted** — the *same Account* appears in Client Management as **Contracting**. No duplicate company/client table row is created.
9. **Closed Won** — the same Account becomes **Customer / Active Client** and retains contacts, opportunity history, contracts, delivery, feedback and billing.
10. **Post-sale lifecycle** — delivery milestones -> satisfaction -> MBR/QBR -> issues/actions -> billing/payments -> renewals/expansion.

## 2. Navigation: one product, no duplicate setup shell

Independent company workspaces use the common SalesOS shell:

- My Dashboard
- Executive Overview (workspace admins)
- Kanban Pipeline
- Prospects & Accounts
- Client Management
- Client Satisfaction
- Tasks & Follow-ups
- Campaigns
- Contracts & Finance
- Team & Settings
- Switch workspace
- Sign out

There must be no separate "business preview" experience or mandatory prospect/contract/invoice wizard. Commercial records are created only when needed.

## 3. Authentication and security

### Operational in preview
- Argon2 password hashes.
- HttpOnly signed session cookie.
- Mandatory MFA after password login.
- Mandatory MFA after Google login.
- Single-use six-digit email OTP, expiry and attempt limits.
- Rate-limited OTP resend.
- Hard seven-day reauthentication boundary checked by both legacy and tenant guards.
- Password change/reset increments password version and invalidates old sessions.
- Selected workspace is signed into the authenticated session; arbitrary organization IDs do not grant access.
- Cross-tenant negative tests for tenant APIs.

### Production gates
- MFA recovery codes / second enrolled factor.
- Distributed login/MFA rate limiting instead of process-local controls.
- SSO/SAML/SCIM for larger customers.
- Device/session management and explicit "sign out other devices".
- Independent penetration test and security monitoring.

## 4. Workspace and company administration

### Operational in preview
- Company workspaces with generated internal slug separate from display name.
- One company creation per user; additional workspace access by invitation.
- Creator is ADMIN and cannot accidentally create a second company.
- Company profile and logo.
- Optional billing/tax identity collected only when finance features need it.
- Team invitations, roles, revocation and membership controls.
- Company-domain signup checks; common personal providers blocked.
- Workspace switching.

### Product rule
Personal-email blocking and mailbox verification prove control of an address, not legal ownership of a company. Production onboarding may require domain/DNS or business verification depending on customer risk.

## 5. Prospect and account model

**Canonical model:** Account = company. Opportunity = one possible engagement with that company. Client Management never creates a second company record.

### Operational in preview
- Create/search prospect accounts.
- Domain uniqueness within a workspace.
- Initial opportunity created automatically at Account Researched.
- Dedicated Account workspace for company context, contacts and opportunities.
- Contacts are created/edited once, carry opt-out state, and are shared across prospect and client lifecycle.
- Multiple opportunities per Account for expansion/renewal.
- Relationship status:
  - Prospect
  - Contracting (from Pilot Contracted)
  - Customer / Active Client (Closed Won)

## 6. Configurable 11-stage sales workflow

The eleven canonical stage IDs remain stable for system integrity and historical reporting. Workspace administrators may customize labels and evidence forms without deleting/reordering the canonical system gates.

1. Account Researched
2. Decision-Maker Identified
3. Outreach Initiated
4. Interest Established
5. Discovery Completed
6. Pilot Qualified
7. Pilot Proposed
8. Pilot Contracted
9. Pilot Delivered
10. Production Negotiated
11. Closed Won

### Operational in preview
- Stage label/short-label customization.
- Custom stage evidence fields.
- Text, textarea, date, select and checkbox field types.
- Required/optional fields.
- Dropdown options.
- Help text.
- Auto-pull sources from CRM account/contact/contract data.
- Auto-pull from any prior stage evidence field.
- Opportunity screen renders the configured fields.
- Kanban uses configured labels and required-field progress.
- Saving evidence triggers server validation.
- Drag/drop never bypasses validation.
- Manager overrides require reason.
- Closed Won signed-production requirement remains non-overridable.
- Stage history/audit records preserved.

## 7. Dashboards

### My Dashboard
- Active opportunities.
- Prospects.
- Deals won.
- Contracts.
- Pipeline-by-stage chart using configured stage labels.
- Recent opportunity activity.
- Links to source records.
- Empty/loading/error states.

### Executive Overview
- Workspace-scoped commercial counts.
- Opportunity/client/contract/invoice totals.
- Invoiced totals separated by ISO currency.
- Pipeline and recent opportunity visibility.
- Admin-only access.

### Operational executive analytics
- Closed-deal win rate based only on recorded won/lost outcomes.
- Median sales-cycle days for recorded Closed Won opportunities.
- Stale open opportunities based on a transparent 14-day no-update rule.
- Overdue task count.
- Signed contracts expiring within 60 days.
- Open pipeline value separated by ISO currency with no invented probability weighting.
- Overdue receivables separated by currency and net of recorded payments/approved customer credits.

Further forecasting/cohort models remain out until backed by enough real recorded history.

## 8. Client Satisfaction

### Operational in preview
- First-class Client Satisfaction navigation.
- Built-in NPS.
- Built-in CSAT.
- Reusable custom questionnaire templates.
- Rating-scale questions.
- Free-text questions.
- Single-choice questions.
- Multiple-choice questions.
- Yes/No questions.
- Required/optional questions.
- Custom rating scale min/max.
- Send survey to a client contact.
- One-time token response page.
- Client-level survey history and answers.
- Company-level response rate, NPS, CSAT and rating averages.
- Client-level satisfaction summary.
- Central template editing/archive/restore instead of repeated builders inside each client.

### Orchestration rule
NPS/CSAT belongs to satisfaction surveys. MBR/QBR/general client meetings belong to Client Reviews. They are intentionally separate to avoid entering the same satisfaction score in two different processes.

## 9. Client Management / Client Success

### Operational in preview
- Contracting and active-client relationship list.
- Client detail based on the original Account.
- Contacts.
- Contracts/invoices/opportunities.
- Rule-based health score using recorded evidence.
- High/critical issue signals.
- Overdue-invoice signals.
- Contract-expiry signals.
- Manual relationship reviews (General / MBR / QBR).
- Client issues and resolution.
- Delivery milestones and status progression.
- Acceptance evidence required before milestone Accepted.
- Renewal planning and automatic follow-up task creation.
- Survey history.
- MBR/QBR report snapshot generation.
- Workspace-specific report layouts.
- Management approval of reports.
- PDF export from immutable snapshot.

## 10. Tasks and follow-ups

### Operational in preview
- Company-scoped tasks.
- Manual task creation with description, assignee and optional opportunity link.
- Team assignee selection from active workspace members.
- Due dates, overdue and due-soon views.
- Search/filter queue.
- Open/Done.
- Opportunity-linked tasks.
- Stage-created tasks.
- Renewal-generated tasks.
- Tenant authorization.

Future optimization: task priority, reminders/notifications and calendar integration.

## 11. Campaigns

### Operational in preview
- Company-scoped campaign planning.
- Campaign name, sector, objective, owner and status.
- Account enrollment/removal.
- Campaign status lifecycle: Planning, Active, Paused, Completed.
- Campaigns reuse existing Account records; they never duplicate prospects.

### Provider gate
Mass email sequence execution and inbound-reply synchronization remain gated until provider consent, suppression, rate-limit and compliance workflows are complete.

## 12. Contracts

### Operational in preview
- Opportunity-linked contract drafts.
- NDA / MSA / SOW / DPA / production-other types.
- Parent MSA -> child SOW validation.
- Structured pricing lines:
  - fixed
  - hourly
  - unit
  - monthly retainer
  - FTE
  - milestone
  - outcome
- Signatory roster and signing order.
- Commercial amendments with versioned pricing snapshots.
- Administrator approval for amendments.
- Contract workspace from Contracts & Finance.
- Private PDF upload/download with SHA-256 integrity checks.
- Executed-PDF administrator verification.
- Manual confirmation of genuinely executed agreements with audit evidence and workflow auto-advance.

### Provider/legal gate
External electronic signing must stay disabled until Google/signing identity, HTTPS, key custody, malware scanning, evidence archive/WORM retention, legal review and end-to-end validation are complete. Internal commercial approval must never be represented as external execution.

## 13. Delivery

### Operational in preview
- Account/contract-linked delivery milestones.
- Planned, In Progress, Submitted, Accepted, Rejected states.
- Acceptance criteria.
- Evidence reference required for Accepted.
- Audit event on milestone status updates.

Future optimization: file-backed acceptance evidence and structured delivery KPIs.

## 14. Invoices, tax and payments

### Operational in preview
- Optional invoice draft creation.
- Line description, quantity, unit rate, currency, billing email and due date.
- Contract link optional.
- Organization-specific tax-rule catalog.
- Draft -> finance approval -> approved rule.
- Tax treatment rationale.
- Immutable invoice tax review snapshot.
- Finance approval.
- Issued PDF generation.
- Download.
- Gmail delivery when integration is authorized.
- Explicit externally-sent reference.
- Partial/full payment recording.
- Payment references and duplicate protection.
- Outstanding-balance history.
- Recurring monthly/quarterly/one-time billing schedules that prepare invoice drafts only.
- Milestone-triggered billing schedules armed only after delivery acceptance evidence.
- Reviewed overdue-reminder tasks and explicit approval/send flow.
- Customer credit-note draft -> administrator approval -> PDF issue -> journal posting.
- Append-only accounting journals with integrity/coverage checks.
- Controlled reversal journals; original entries remain immutable.
- Manual bank-statement-row import and payment reconciliation/matching.

### Production gates
Tax determination remains human/accountant reviewed. SalesOS must not infer legal VAT/tax treatment. Accounting needs production migration/reconciliation and independent finance review before being treated as statutory books.

## 15. Reporting

### Operational in preview
- Client MBR/QBR frozen snapshots.
- Custom workspace report layouts.
- Health, agreements, finance, issues and satisfaction included from recorded data.
- PDF generation.
- Management approval state.
- Executive dashboard.

Future optimization: scheduled reports, controlled client distribution and richer chart layouts.

## 16. AI and external integrations

### Operational / gated by provider state
- Tenant-scoped opportunity research, lookalikes, contact ranking and outreach drafting using the safe demo provider when live AI is unavailable.
- Reviewed outreach can be sent through the authenticated user's connected Gmail only when deployment sending is enabled.
- Gmail connect/status/disconnect is available to independent company workspaces.
- OpenAI provider configuration hooks.
- Apollo provider configuration hooks.
- Google Login.
- Signing provider foundation plus operational manual executed-PDF evidence flow.

### Product rule
No external provider is shown as "working" because a key exists. Product UI must distinguish:
1. Not configured
2. Configured
3. Connected/authenticated
4. Tested
5. Enabled for production

Live OpenAI/Apollo enrichment and Gmail reply sync require provider credentials, consent flows and end-to-end tests outside source code.

## 17. Redundancy removed in this consolidation

- Removed separate client-company creation: Account becomes Contracting/Customer.
- Removed forced Prospect -> Opportunity -> Contract -> Invoice commercial wizard.
- Removed questionnaire builder duplication from individual client screens.
- Removed duplicate NPS/CSAT manual-entry workflow from relationship reviews.
- Removed duplicate manual MBR/QBR creation; formal MBR/QBR now uses the snapshot/report workflow only.
- Removed obsolete Target Industries vs Target Customers duplication in company profile.
- Removed mandatory finance identity fields from initial workspace onboarding.
- Removed preview-box navigation and manual "back" links where the permanent SalesOS sidebar exists.
- Replaced browser-default selects in tenant prospect/commercial/finance/tax flows with shared SalesOS controls.
- Centralized pipeline configuration instead of hard-coded stage forms.
- Company display names are no longer constrained by internal URL identifier rules.

## 18. UI system

- Light-only SalesOS shell.
- Afacad typography.
- White cards with neutral borders.
- Seebot orange accent/CTA system.
- Shared Button, Panel, Field, BrandSelect, Badge, Modal, Empty and PageTop primitives.
- Responsive sidebar.
- Small route/page entrance transitions.
- Hover/focus motion on cards and controls.
- Loading/empty/error states.
- No artificial loading delays.
- No browser-default dropdowns in the consolidated tenant workflow.
- Native prompt/confirm dialogs removed from milestone acceptance and pipeline reset; both use branded modals.
- Team & Settings is organized into Company & Team, Sales Workflow, Client Reporting, Integrations, and Security & Audit tabs.

## 19. Current source-level completion checkpoint

The consolidated company-workspace product now covers the full in-app lifecycle:
- authentication + mandatory sign-in MFA + hard seven-day reauthentication;
- company/team onboarding;
- prospect/account/contact management;
- configurable 11-stage pipeline;
- opportunity intelligence/outreach;
- contracting/document evidence;
- delivery/client health/satisfaction;
- MBR/QBR reports;
- invoices/tax/payments/credits;
- recurring and milestone billing;
- accounting/reconciliation;
- tasks/campaigns;
- executive analytics;
- integration/security/audit settings.

This does **not** mean production certification. External providers and legal/operational controls below still have release gates.

## 19. Release gate checklist

Do not call the product production-ready until all of the following are green:

- CI typecheck/unit/policy/browser suite.
- Reviewed Prisma migrations against a copy of existing production data.
- Cross-tenant negative tests for every new/legacy data and file route.
- Concurrency tests for invoice issuance, numbering, payments, amendments and signing.
- Backup/restore drill.
- Production email/OAuth provider tests.
- Distributed auth/MFA abuse controls and MFA recovery.
- File malware scanning, encryption and secure object storage.
- Signing legal/security review and WORM evidence retention.
- Tax/accounting review for target jurisdictions.
- Observability, audit export, retention/privacy policies.
- Independent penetration test.
- Accessibility/keyboard/contrast verification.

## 20. Definition of the finished product

SalesOS should feel like one continuous operating system:

**Authenticate -> Select company -> Sell -> Qualify -> Contract -> Deliver -> Measure satisfaction -> Bill -> Collect -> Review -> Renew / Expand.**

Every module reads and writes the same underlying company relationship. Information entered once should be auto-pulled where appropriate, not requested again in a later workflow.
