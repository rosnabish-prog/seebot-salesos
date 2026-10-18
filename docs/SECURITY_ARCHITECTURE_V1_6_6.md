# Security and accounting architecture — v1.6.6

| Module | Owner | Invariant |
| --- | --- | --- |
| `workspace/tenant-scope.service.ts` | Authorization | Selected org + active membership + persisted record lineage required on every new tenant business endpoint. Never trust owner/org IDs from the request body. |
| `workspace/tenant-business.controller.ts` | Tenant CRM preview | List/get/create for tenant opportunities, clients, contracts, invoice drafts and dashboard. Fictional `.example` accounts only. |
| `workspace/tenant-accounts.controller.ts` | Tenant prospects | Uses selected org and membership, local-only preview. |
| `common/auth.guard.ts` | Legacy route protection | Legacy global CRM restricted to Seebot member; project retains its old global-role model and needs complete migration. |
| `accounting/journal-policy.ts` | Pure accounting arithmetic | Integer cents; positive lines; zero residual within one currency. Reversals rather than editing history. |
| `accounting/journal.service.ts` | Ledger and bank matching | Journal source idempotency and append-only lines; bank match only if payment belongs to same org and exact amount/currency. |
| `accounting/tax-review.controller.ts` | Human tax decision | Tax classification and rationale stored as immutable invoice snapshot; changing invoice totals invalidates issuance. |
| `signing/evidence-archive.service.ts` | Audit evidence | Ed25519 seal, pinned public key verification; agreement status only finalized after every signer has an archived valid receipt. Actual offsite WORM storage is a separate infrastructure task. |
| `invoices/invoice-pdf.service.ts` | Invoice issuance | Manager approval, reconciled totals, tax review, hashed PDF and ledger journal. Requires DB race testing. |

## Future production tenant migration

1. Add non-null `organizationId` to every root model in a backfill-first migration; enforce owner/member joins and composite keys (for source and child records) in schema constraints.
2. Make authenticated org membership and membership role mandatory in every controller and nested service. Eliminate global `SUPER_ADMIN` role as tenant authority.
3. Replace legacy controllers with scoped services; require all list and aggregate queries to filter at DB boundary; enforce policy on document reads and background tasks.
4. Add DB-backed cross-org attack regression tests and establish defense in depth (e.g. carefully implemented PostgreSQL RLS using per-transaction context), before public signup.
5. Operate on staging with synthetic multi-tenant data until security approval.

## Immutable evidence operational requirement

An Ed25519 signature proves that receipt bytes correspond to the private key; it **does not** prove the key was protected or establish independent timestamping. Provision offsite write-once retention (e.g. locked object storage), pinned keys outside SalesOS, retention policy, third-party time source where necessary, and periodically export/verify archives. Recovery/rotation must be exercised. Separate a customer’s consent to e-sign from confirmation of authority to act for a company.
