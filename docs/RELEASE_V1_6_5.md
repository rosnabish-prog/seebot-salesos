# Seebot SalesOS v1.6.5 — Security and Finance Foundations (DEVELOPMENT PREVIEW)

This is **not a production-grade complete release**. It builds additional missing features without enabling public multi-tenant access or untested legal-signature workflows. Do not process real contracts or financial records yet.

## Changes shipped

- **Tenant ownership:** `Account.organizationId` on CRM's root company record; company/domain uniqueness is now scoped to organization. `bootstrap:organization` backfills previously unscoped legacy Seebot accounts. Isolated `/workspace-crm/:orgId/accounts` routes and `/workspaces/:id/accounts` UI are provided for **fictional `.example`/`.invalid` domains only**, when `TENANT_SCOPED_CRM_PREVIEW=true` in development. Production tenant CRM remains disabled.
- **Why tenant access is still gated:** Legacy Seebot controllers for opportunities, invoices, contract PDFs, charts, activities and nested writes still use global record IDs. New tenant accounts could be looked up from global manager routes. Do not remove the gate until *all* entity paths enforce selected membership/tenant. Basic membership and new routes alone are not enough.
- **Multi-signer sequence:** per-envelope `signatoryId`, designated signer check, serialized activation order, previous signed PDF fed forward as the next input, final contract state only after all required participants complete, separate PDF retrieval for all signed participants, individual final-copy message drafts/attempts.
- **Evidence archive:** Ed25519-sealed immutable-in-app JSON receipt, hash-chain verification, separate archive mount and independently pinned-public-key verification script. A failed archive is surfaced as `archived:false` rather than falsely claiming success. **True independent tamper-resistant retention still requires append-only/WORM offsite storage, external key custody, retention policy, backups and legal review.**
- **Finance correctness:** Internal write-offs no longer reduce legal client receivables; only approved credit notes do. Invoice PDF issuance validates line totals, taxes and fractional unit rates (up to six decimals). Gmail invoice send only marks an invoice SENT when the primary delivery reports success.
- **Regression tests:** independent signature receipt tampering, signer ordering, credit vs write-off, exact cents, journal balance policy and tenant preview gates.

## Known unresolved work — DO NOT LABEL COMPLETE

1. **Multi-company production:** Tenant-scope *every* existing CRM, invoice, payment, contract, audit, PDF, task, survey and executive-report API, and background jobs; enforce organization roles instead of platform-wide roles. Add validated public registration and password reset, verified staff invitations, MFA, rate limits, and real cross-tenant adversarial integration tests. Tenant prospect preview is not evidence that the complete legacy CRM is tenant safe.
2. **Legal signature:** Google ID/OAuth integration requires valid client ID, trusted HTTPS, live identity checks, CSRF/session controls, signer authority review and security/legal acceptance. An attestation PDF is not a qualified cryptographic PAdES signature. Independent audit durability is an infrastructure and legal-governance requirement. Concurrent event-chain race retry, key rotation and WORM storage need validation.
3. **Accounting:** Core ledger does **not** provide a certified double-entry general ledger, multi-jurisdiction VAT/tax rules, credit-note tax allocations, issued-invoice correction workflow, bank reconciliation or tax-compliant archiving. Require accounting review before actual use.
4. **Communications:** Google OAuth/Gmail sending and outgoing receipts depend on real credentials and consent, live delivery testing and retries. False/dummy sends must remain clearly labeled.
5. **Production verification:** No full Next.js/NestJS build, generated Prisma migration on a real database, browser tests, security penetration tests or deployment/backup restore tests were run in this environment. Source tests and syntax parse do not replace those checks.

## Safe local upgrade from v1.6.4 (Windows)

1. Stop frontend/backend with Ctrl+C, keep Postgres/Redis. Back up database **and private document/evidence storage**, and verify backup integrity. Rotate previously shared secrets.
2. Extract patch ZIP into a separate folder; run `APPLY_SEEBOT_V1_6_5.cmd`, selecting the existing SalesOS project root. Installer verifies file hashes and backs up replaced source. It does **not** alter `.env`, credentials, PostgreSQL, or send emails.
3. Inside the SalesOS root, ensure dependencies are available (`npm.cmd install` if needed), and **generate/inspect a proper versioned migration before application**. `Account.domain @unique` has been replaced with `@@unique([organizationId,domain])`, and `SigningEnvelope.signatoryId` was added. On a staging copy, migrate existing accounts to the original Seebot tenant **before** activating any new tenant. Do not use destructive `db push`, `--accept-data-loss` or reset in production.
4. Run `npm.cmd run db:generate`, then `npm.cmd run bootstrap:organization -w @seebot/database` only after applying the verified schema migration; check all existing accounts received the Seebot organization ID.
5. Run `npm.cmd run typecheck`, `npm.cmd run test`, `npm.cmd run build`, then `npm.cmd run dev`. Fix any failures before allowing users to log in. Perform browser and API regression checks with dummy data.
6. Keep `TENANT_SCOPED_CRM_PREVIEW` unset. For isolated **fictional** tenant API testing on a local development environment only, set `TENANT_SCOPED_CRM_PREVIEW=true`, restart API and select a test workspace. This feature cannot run in `NODE_ENV=production`.
7. Keep `SIGNING_ENABLED=false` until all integration/security tests pass. The signing engine requires `GOOGLE_SIGNING_CLIENT_ID`, `SIGNING_AUDIT_KEY`, `SIGNING_PUBLIC_BASE_URL`, `SIGNING_EVIDENCE_DIR` and `SIGNING_EVIDENCE_PRIVATE_KEY_FILE` before activation. Key paths must be absolute. Never share the private key.

## Evidence setup (staging only)

Create Ed25519 evidence key pair with your standard secret manager or OpenSSL. Preserve the **public key independently** of the SalesOS host. Put the private key in access-restricted secret storage. Configure a separate evidence storage mount with external append-only/immutable replication. To verify an exported JSON receipt from a different computer:

```
node scripts/verify-signing-evidence.mjs receipt.json trusted-public-key.pem
```

This script validates the signature over the receipt and SHA-256 body with the **externally supplied** key. A self-provided public key is not reliable proof of origin. It does not validate an external trusted timestamp or legal certificate chain.

## API additions

- `GET /api/workspace-crm/:orgId/accounts` — selected-workspace fictional prospect list (development opt-in)
- `POST /api/workspace-crm/:orgId/accounts` — create fictional prospect + initial opportunity
- `GET /api/workspace-crm/:orgId/accounts/:accountId` — tenant-authorized record details
- `POST /api/workspace-crm/:orgId/accounts/:accountId/contacts` — tenant-authorized contact
- `POST /api/contracts/:id/signing/:envelopeId/archive-evidence` — manager evidence archive/retry
- `GET /api/contracts/:id/signing/:envelopeId/verify-evidence` — authorized archive signature verification

All original provider endpoints remain in source but real integrations remain gated.
