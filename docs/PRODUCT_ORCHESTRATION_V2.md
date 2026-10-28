# SalesOS Product Orchestration v2

**Purpose:** canonical product flow and domain ownership after the multi-workspace, client-success, finance, security and pipeline consolidation. New work should follow this document instead of adding parallel workflows.

## 1. Product flow

```
Login / Google
  -> mandatory SalesOS verification code
  -> workspace resolution
       -> no workspace: minimal company setup -> optional team invites
       -> one workspace: selected automatically
       -> multiple memberships: explicit workspace chooser
  -> My Dashboard
  -> Prospect / Account
  -> Opportunity (11-stage pipeline)
  -> Contracting relationship appears in Client Management at Pilot Contracted
  -> Active Client at Closed Won
  -> Delivery / Client Success / Satisfaction / Renewals
  -> Invoicing / Payments / Accounting
```

No user should be forced to create a prospect, contract, invoice, survey or complete optional billing/company fields during onboarding.

## 2. Canonical business entities — avoid duplicate records

### Company / Account
One `Account` represents the external company through its entire lifecycle. Do **not** create a second "client company" record.

- Prospect: Account exists, sales opportunity is open.
- Contracting: same Account appears in Client Management when an opportunity reaches `PILOT_CONTRACTED`.
- Active Client: same Account becomes `status=Customer` at `CLOSED_WON`, with `clientSince`.
- Expansion/renewal: create another Opportunity on the same Account.

Contacts, activities, contracts, invoices, reviews, surveys, issues and delivery milestones remain attached to that same account relationship.

### Opportunity
An Opportunity is one commercial pursuit, not the customer. Multiple opportunities may exist per Account over time.

### Client review vs satisfaction survey
- **Survey** = feedback requested from the client. NPS, CSAT or configurable questionnaire. This is the canonical external satisfaction record.
- **Client Review** = internal relationship event such as MBR/QBR and action plan. Do not create a second manual NPS/CSAT process for new tenant workflows.

### Team invitation
`WorkspaceInvitation` is the canonical invitation for independent company workspaces. Legacy Seebot employee invitation code remains compatibility-only until its routes are migrated.

## 3. Authentication and session policy

- Every interactive password sign-in requires a one-time SalesOS verification code.
- Google identity sign-in also requires the SalesOS verification step.
- Verification codes: six digits, hashed at rest, ten-minute expiry, single use, attempt limited.
- Full authenticated session: absolute seven-day JWT/cookie lifetime.
- Workspace selection uses a separate signed workspace cookie and never renews the seven-day login session.
- Password change invalidates sessions through password versioning.
- Disabled users and disabled workspace memberships are rejected on subsequent requests.
- Public deployment requires a distinct `MFA_CODE_SECRET`, TLS, provider delivery monitoring and edge/distributed rate limiting.
- Email codes are the current operational second step. TOTP/WebAuthn/passkeys are a recommended hardening upgrade before high-risk production use.

## 4. Company onboarding

Required:
- user name
- verified company email / approved identity
- account password for password users
- company name

Optional and deferred:
- website
- industry
- country
- timezone
- currency
- legal name
- services
- target customers
- billing address
- tax registration
- logo

Team invitation is optional. The creator becomes workspace Owner. One verified company-email identity may own multiple independent company workspaces and join other teams by invitation.

## 5. 11-stage opportunity spine

The canonical IDs and order stay stable for analytics, audit and system gates:

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

Workspace administrators may customize:
- visible stage name / short label
- evidence fields
- field type
- required/optional status
- dropdown choices
- help text
- approved auto-pull source

Auto-pull sources may reference:
- canonical CRM fields on Account, Opportunity, Contact and Contract
- a saved evidence field from an **earlier stage**

Auto-pulled data is shown as a suggestion and becomes stage evidence only after a user reviews and saves it.

System gates remain independent and cannot be deleted through Settings:
- verified buyer/contact
- logged outreach
- positive response
- sent/accepted proposal
- executed pilot agreement where required
- client acceptance
- signed production contract + committed amount for Closed Won

Manager override requires a reason. Closed Won production signing evidence is non-bypassable.

## 6. Client Management orchestration

### Entry
Client Management is relationship management, not a duplicate CRM.

A company becomes visible there at **Pilot Contracted** because delivery/commercial coordination now matters. It is labeled **Contracting**.

At **Closed Won**, the same Account is labeled **Active Client**.

### Client workspace
The client detail should consolidate:
- relationship status
- contacts
- active/historical opportunities
- contracts and expiry/renewal
- delivery milestones
- invoices / receivables
- issues / escalation
- health signals
- satisfaction surveys
- MBR/QBR reviews and action items

Avoid separate pages that ask users to recreate the same company, contact or commercial data.

## 7. Client satisfaction

Built in:
- NPS
- CSAT

Configurable questionnaire:
- rating scale (0–10 bounds)
- written text
- single choice
- multiple choice
- Yes/No
- required / optional questions
- reusable organization templates
- archive / restore templates

Lifecycle:
1. select client/contracting relationship
2. select built-in or custom template
3. choose client recipient
4. send through approved outbound integration, or private preview for demo data
5. one-time external questionnaire
6. store structured answers
7. aggregate NPS/CSAT where applicable
8. surface detractor / client-success follow-up
9. preserve response history

Custom questionnaire ratings are not silently mixed into NPS or CSAT.

## 8. Navigation / information architecture

Persistent company sidebar:
- My Dashboard
- Executive Overview (Admin/Owner)
- Kanban Pipeline
- Prospects & Accounts
- Client Management
- Tasks & Follow-ups
- Campaigns
- Contracts & Finance
- Team & Settings
- Switch Workspace
- Sign Out

Settings owns:
- Company profile
- Team / invitations / roles
- Pipeline configuration
- integrations/readiness
- security policy

Do not send users out of the app shell to a second Settings experience.

## 9. Progressive disclosure — when fields should appear

Ask for data at the point it is needed:
- tax / billing identity -> before invoice approval/issue
- billing recipient/address -> when invoicing
- signatory -> when preparing signature
- survey recipient -> when sending a survey
- delivery acceptance evidence -> at delivery
- renewal data -> when signed contract has an expiry
- stage evidence -> in the relevant opportunity stage

This replaces large mandatory forms and duplicate data entry.

## 10. AI and automation policy

AI belongs inside the Opportunity / Account workflow, not as a competing record system.

AI may:
- suggest research
- draft stage fields
- summarize existing evidence
- draft outreach
- propose next actions
- suggest prior-stage/CRM data to reuse

AI may not:
- invent completed customer interactions
- mark evidence verified by itself
- silently advance stages from generated text
- send messages without an explicit configured/approved workflow
- infer tax treatment or legal execution

## 11. Finance and commercial flow

```
Opportunity
 -> proposal
 -> contract / pricing
 -> signing evidence
 -> Closed Won
 -> client delivery
 -> invoice draft
 -> finance/tax review
 -> approval
 -> invoice issue
 -> delivery
 -> payment / credit
 -> append-only accounting journal
```

Currencies remain separated. Tax is reviewed, not inferred. Legal receivables change through payment or approved credit, not internal write-off.

## 12. UI system

- light-only SalesOS surface
- Afacad typography
- white cards, fine neutral borders
- Seebot orange accents / accessible primary action treatment
- consistent `Field`, `BrandSelect`, buttons, badges, panels and modal patterns
- responsive desktop/mobile layouts
- skeleton states and meaningful empty states
- subtle route/card/field transitions only
- honor `prefers-reduced-motion`
- no artificial loading delays
- no default browser-looking controls where a product component exists

## 13. Consolidation / deprecation direction

These duplications should not grow:

1. Legacy global Seebot CRM vs tenant CRM:
   - tenant-scoped services/controllers are the target architecture.
   - legacy routes stay restricted to the original Seebot workspace until migrated and regression tested.

2. Legacy Client Survey UI vs tenant questionnaire system:
   - configurable tenant questionnaire model is the target for independent workspaces.
   - legacy routes remain compatibility-only until Seebot Client Management is migrated onto the scoped service.

3. Old Intelligence pages vs Opportunity Workspace:
   - Opportunity Workspace is canonical.
   - separate intelligence routes should remain redirected/deprecated.

4. Client company vs Account:
   - Account is canonical. Never clone a customer into another table just because the sales stage changed.

5. Workspace profile pages:
   - one shared company-management component is canonical, embedded inside the app shell.

## 14. Release gates before production claim

A green development build is not enough. Before public multi-company production:
- versioned reviewed Prisma migrations, not `db push`
- tenant-negative tests for every API/file/download route
- edge/distributed login and public-token rate limits
- TOTP/WebAuthn/passkey evaluation for stronger MFA
- production email delivery and bounce/failure observability
- Google OAuth configuration and consent review
- secure object storage, malware scanning, retention, backups and restore drills
- signing legal/security approval and independent evidence retention
- accountant-reviewed tax/credit/invoice rules
- payment/bank integration reconciliation tests if connected
- CSP/CSRF/proxy/IP configuration review
- accessibility and supported-browser QA
- load/concurrency testing for invoice numbering, payments, stage moves and invitations
- external penetration/security review

## 15. Product completion principle

Do not call a feature complete because a screen exists. A SalesOS capability is complete only when:
1. the domain model is unambiguous,
2. the API is tenant-authorized,
3. the UI follows the shared design system,
4. validations and failure states are implemented,
5. audit behavior exists where necessary,
6. unit/policy tests pass,
7. cross-tenant negative tests pass,
8. browser E2E passes for the real user journey,
9. external-provider/legal/finance dependencies are explicitly verified or honestly gated.
