# Seebot SalesOS v1.6.0 — Secure Signing Foundation (development preview)

**Not ready for genuine signatures or public multi-company access.** This release extends the current v1.5 CRM without resetting records. Full application compile, Prisma migration, Google OAuth, PDF execution, concurrency testing, lawyer review, and browser E2E have **not** been performed in this environment. `SIGNING_ENABLED=false` is the default.

## What is implemented

- Seebot organization profile and membership foundation (one fixed `seebot` org; public multi-company creation remains disabled).
- Contract pricing line database + API: fixed, hourly, unit, monthly retainer, FTE, milestone, outcome.
- Restricted signing invitations: one immutable source PDF snapshot, one recipient email and name, expiry, random 256-bit bearer token with SHA-256 hashed storage; revocable.
- Internal admin create-draft / activate-link / revoke / list-audit endpoints; activating creates a copyable URL **without** claiming email delivery. Activating requires Sales Manager/Super Admin approval.
- External `/sign/[token]` page: Google Identity Services sign-in, backend ID-token signature/audience/email verification, original document preview, explicit signature consent and authority checkbox, typed signature; final PDF with attestation page; signed final document available to verified signer for 30 days.
- Logs for `INVITATION_DRAFT_CREATED`, `INVITATION_ACTIVATED`, `AUTHENTICATED_AND_OPENED`, `DOCUMENT_VIEWED`, `ELECTRONIC_SIGNATURE_COMPLETED`, `EXECUTED_DOCUMENT_DOWNLOADED`, and `INVITATION_REVOKED` as available. Events include server UTC time, Google subject/email, request IP, user agent, document hash and an HMAC-linked chain. **Opened/viewed means access, not proof that every page was read.**
- Executed PDF is stored in the existing private server document directory; staff verification and contract finalization remain an independent step.
- No PandaDoc integration. No signature image upload/drawing yet (typed signature only). No external email delivery, OTP, notarization, witnessing, advanced/qualified digital signature, or immutable offsite audit anchoring yet.
- In-memory state or local filesystem is not appropriate for multi-node production; use encrypted private object storage, durable queue, offsite immutable audit backups and key rotation before live use.

## Access and security decisions

1. **Link alone never grants document access.** The link token plus a valid server-verified Google ID token must match the invitation email. Identity is locked to the verified Google `sub` once signed.
2. Email matching is exact and case-insensitive. Only Google-hosted Gmail and genuine Google Workspace hosted-domain accounts are accepted. Other domains require a future email OTP / stronger verification flow.
3. Contract draft PDF hash is checked before preview and signing; signed PDF hash is checked on download. A new finalized PDF is created with an attestation page. This is an ordinary electronic signature, **not** a qualified/PAdES digital signature.
4. No evidence of a client's legal authority is established merely by Google or Apollo. Approval records and legal review remain necessary.
5. `SIGNING_AUDIT_KEY` HMAC chaining is only part of a defensible audit system. Database admins with access to the HMAC key can rewrite the log. For production use append-only database permissions, WORM backups, offsite anchored digests, monitoring, separate keys and recovery evidence.
6. IP addresses/user agents are personal data; retain with privacy notice, limited access and a retention policy. Inferred city-level IP locations are optional and not automatically reliable.
7. Disable URL logging/referrer leakage, enforce HTTPS, rate limiting, IP/proxy correctness, CSP, CSRF defence, PDF malware scanning, and signed artifact storage before public deployment.
8. **Tenant isolation is not complete.** Do not enable registration for a second organization yet.

## API routes added

Authenticated CRM staff:
- `POST /api/contracts/:id/signing/drafts`
- `POST /api/contracts/:id/signing/:envelopeId/activate`
- `POST /api/contracts/:id/signing/:envelopeId/revoke`
- `GET /api/contracts/:id/signing`
- `GET /api/contracts/:id/pricing`, `POST`, `PATCH`, `DELETE` pricing lines
- `GET /api/organizations/current`, `PATCH /api/organizations/current`

External signer (no SalesOS employee account):
- `POST /api/signing/access`
- `POST /api/signing/document`
- `POST /api/signing/complete`
- `POST /api/signing/executed-document`

## Before local install

1. Stop all SalesOS Node servers (to release Prisma's Windows DLL) but keep Docker Postgres and Redis up.
2. **Back up your database** with `pg_dump -Fc`; copy it to Windows, verify nonzero size, and test `pg_restore -l` can read it.
3. Extract patch to a separate directory and double-click `APPLY_SEEBOT_V1_6_FOUNDATION.cmd`; it backs up source files and does not alter `.env` or Postgres.
4. Run `npm.cmd install` to add `google-auth-library` and `pdf-lib` to the API package, then `prisma db push`, `prisma generate`, `npm.cmd run typecheck`, `npm.cmd run test`, `npm.cmd run dev`. **Abort** if Prisma proposes a destructive reset or data loss. Use the repo's database settings; no new database is needed.
5. Bootstrap the internal organization using `dotenv.cmd --no-expand -e .env -- npm.cmd run seed -w @seebot/database` (only after reviewing the seed; the existing admin password is not reset).
6. Visit an existing client contract page and upload a `DRAFT` PDF, then examine the new signing section. With no Google configuration the create-invitation route intentionally refuses to run. This is expected.

## Google configuration when ready

Create a Google OAuth **Web application** client for the signer-facing application. Provide a secure HTTPS domain and add it to the Google authorized origins. Configure server-side `GOOGLE_SIGNING_CLIENT_ID` and public `NEXT_PUBLIC_SIGNING_GOOGLE_CLIENT_ID` to the same client ID; set a unique strong `SIGNING_AUDIT_KEY`, and `SIGNING_PUBLIC_BASE_URL=https://signing.example.com`. The API and browser origins/CORS must match your deployment. Set `SIGNING_ENABLED=true` **only after security/legal/E2E approval and staging tests**. Never send credentials in chat or commit them to source.

## Known risks / next development

- Replacing filename storage with encrypted durable object storage and anti-malware scanning.
- External verification alternatives for non-Google-hosted email addresses and stronger identity/authority challenge for higher value agreements.
- Multiple signers/sequencing, signature drawing/upload, countersignature, witness/formality support, owner approval flow, immutable audit certificate with offsite digest anchoring.
- Document issuance via Gmail, signed-certificate delivery, webhook status, more resilient transactional logging and replay-safe queue.
- Tenant-scoped accounts/users/opportunities/contracts/files before enabling multi-company signup.
- Contract billing PDF generation, invoice numbering, and surveys remain future releases.

## Validated here

- Source parse validation across TypeScript/TSX files.
- 18 Node tests (including 4 signing security helper tests), no runtime credentials required.
- ZIP test and installer static checks.

**Not validated:** Full TypeScript typechecking, Prisma schema validation/migration with the actual local Postgres, Google Sign-In, PDF rendering, Windows install, application browser workflow, signing evidence sufficiency or production security.
