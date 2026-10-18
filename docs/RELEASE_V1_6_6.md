# Seebot SalesOS v1.6.6 — Tenant/Accounting/Evidence Hardening (Development Preview)

**Status: NOT PRODUCTION READY.** This release adds nontrivial implementation work, but this runtime has no PostgreSQL or registry access, and no real Google authentication, customer signing, financial institution or immutable remote archive to test. DO NOT enable public multi-company signups, live signing or send commercial invoices based on this package alone.

## Changes

- Dedicated, organization-scoped endpoints for opportunities, client lists/records, contracts, invoice drafts, and scoped dashboard at `/api/workspace-business/:orgId/*`. Strict selected-workspace + membership checks; existing preview remains local-only and fictional `.example`/`.invalid` data only.
- Extra Seebot legacy organization checks for account and opportunity access and Seebot dashboard/client lists. **Other legacy endpoints still need a complete tenant-by-tenant security audit.**
- Per-organization append-only accounting journals in `AccountingJournal` and `AccountingPosting`, with integer minor units, balancing checks, source-idempotency keys and restricted journal inspection. New real invoice PDF issuance, manually recorded payment and issued credit note post journals in the same Prisma transaction as their business record.
- Organization-scoped ledger coverage reporting and manager-approved reversing entries (never edits to original postings).
- Manually entered statement rows with organization-scoped exact-amount/currency payment matching. No automatic bank import or claims of bank verification; duplicate bank references and matches are rejected at the database uniqueness boundary.
- Immutable per-invoice tax review snapshots, recording jurisdiction, tax treatment, rationale, reviewer and totals. Issuance checks these snapshots before generating invoices. **Tax is not inferred**; professional review of jurisdiction, rates, reverse charge, VAT invoices and refunds is still required.
- Agreement-level signing finalization held pending evidence receipt validation for every required signer. Signer events may be completed without a finalized contract if the evidence archive is unavailable. The existing external witness/public-key script remains available.
- A developer-only workspace operations page to inspect organization-scoped opportunities, contracts, clients, invoices and counts.
- New source-level journal and tenant policy tests, and integration checklist.

## Strong boundaries

- Public company CRM registration: **DISABLED**. `TENANT_SCOPED_CRM_PREVIEW=true` works only with `NODE_ENV != production`, using fictional data. This is not full multi-tenancy for the legacy CRM.
- Signing: keep **disabled** without real Google OAuth, hardened public HTTPS, legal review, separate public-key governance and offsite WORM storage. Local `wx` evidence files are not WORM storage.
- Invoice & ledger: journal source logic is new and has no verified migration, concurrency testing, regulatory accounting certification or opening-balance migration. Do not use as the company's authoritative accounting books.
- Email: Gmail only when explicitly configured; no simulated send is presented as a real delivery.
- Demo data: keep fictional, do not mix with financial reporting.

## Installation on Windows (staging only)

1. **Stop Node servers; keep PostgreSQL and Redis available.** Create a verified `pg_dump -Fc` backup and preserve a second copy of `DOCUMENT_STORAGE_DIR`, `INVOICE_STORAGE_DIR`, `CREDIT_NOTE_STORAGE_DIR`, and `SIGNING_EVIDENCE_DIR`. Back up key material securely, separately from the document archive; do not include secrets in issue reports.
2. Extract the patch. Run `APPLY_SEEBOT_V1_6_6.cmd`. The installer checks the payload SHA-256 manifest, preserves overwritten files under `.salesos-backups`, and does not touch the DB or `.env`.
3. Review `packages/database/prisma/schema.prisma`. It adds `AccountingJournal`, `AccountingPosting`, `BankStatementRow`, `InvoiceTaxReview` and their relationships. Existing invoice issuance now requires an approved tax snapshot. Plan and review a **versioned Prisma migration** in a staging copy; do **not** use `--accept-data-loss` or reset production data.
4. With `npm.cmd` and project dependencies available, perform `npm.cmd ci` only if a lockfile exists and the dependency versions match your approved baseline; otherwise use your existing lockfile-controlled installation process.
5. Run Prisma validation/generation, migration and tests in staging:

```powershell
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd validate --schema=packages/database/prisma/schema.prisma
.\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd generate --schema=packages/database/prisma/schema.prisma
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Do **not** proceed with schema update if Prisma signals data loss.

## Required end-to-end acceptance before real use

- Two organizations, each with owner, staff and finance member. Test direct record IDs and every GET/POST/PATCH/DELETE through ALL legacy and new controllers: prospects, opportunities, contracts, documents, pricing, invoices, payments, exports, reports, campaigns, tasks, AI, background jobs, and file downloads. Verify 403/404 for other-tenant resources, including manager identities and forged child IDs.
- Real PostgreSQL migration with existing Seebot data, idempotent backfill, transaction conflict tests, replica/backups and restore.
- Concurrent invoice issuance must yield one issued PDF, one invoice number and exactly one balanced journal. Retry, simulate file failure, verify rollback/recovery. For historical invoices, approved credits and payments, reconcile opening journals explicitly instead of silent backfill.
- Bank statement import replay, duplicate ref collision, double-match, cross-org match, zero/partial payment and currency mismatch tests.
- Tax-review changes and tax-bearing credit notes require accountant-reviewed allocation. Check actual jurisdiction invoice/credit formatting and numbering with finance/legal advisers.
- External Google signer trials including invited-email mismatch, concurrent signing, order, expired/revoked invitations, key rotation, loss of archival mount, tampered signed PDF, revoked cert, recovery and independent WORM audit test with pinned key held by an independent operator.
- Test Next.js login and organization switch in browsers. Check cookies/CSRF protections, file storage, multi-device sign-in and role changes.
- Observability, alerts, encryption, backups, retention, penetration test, independent legal and financial sign-offs.

## Verification performed in this environment

- 63 source-level Node tests passed, including 7 new v1.6.6 policy tests.
- TypeScript syntax/transpile parsing passed for 122 TS/TSX source files.
- `tsc -p apps/api/tsconfig.json` **could not complete**: no installed NestJS, Prisma or node typings. Prisma CLI validation and real migrations unavailable (no registry access or PostgreSQL).
- No live external provider or browser end-to-end tests were run.

**Do not describe this code as full production tenant isolation, legally certified electronic signing or a compliant accounting system.**
