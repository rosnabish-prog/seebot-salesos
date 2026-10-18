# v1.6.1 — Organization and communication foundation (preview)

**What is implemented in source:**
- Separate, readable modules for Google workforce sign-in, Gmail authorization and sending, encrypted token storage, audited outbound messages, staff invitations, invoice PDF issuance, and contract email delivery.
- Organization administration: company/legal name, industry, offerings, ideal customer description, tax number, issuing address, reporting timezone and currency.
- Staff invitation by email; employees accept with the *exact invited verified Google address*. Uninvited Google users cannot sign in. Existing password login remains available for current staff.
- Gmail authorization for each existing staff user through a separate OAuth consent flow. Gmail only has `gmail.send`; no inbox reading in this release.
- Signing invitations: manager activation creates an email for the named signer; receipt for executed signed PDF. External signing remains disabled by default.
- Generated invoice PDF: finance issues an approved invoice using the stored commercial lines, assigns a sequential numbered series and retains its SHA-256-verified PDF in private storage. The employee can send the PDF as a Gmail attachment. Draft invoices do not count as sent.
- Structured contract pricing editor linked to existing pricing lines.
- More informative chart hover/focus values.
- Separate UI components and a documented module ownership map; corrected pre-existing Client Detail 'use client' directive.

**Not included / not safe to enable yet:**
- Public signup, independent multi-tenant workspaces and cross-tenant isolation; tenant-wide migration is still required.
- OpenAI/Apollo API calls, Gmail reply sync, automation of five-day overdue emails, bank reconciliation, public NPS surveys, full MBR PDF export, advanced enterprise permission administration or payment subscriptions.
- Full legal certification or production-ready signing infrastructure. Self-managed signing requires operational security reviews and legal approval.
- No production claim. Only source/test checks here; full application build and live OAuth and email require Windows/staging execution.

## Manual installation — source patch

1. Stop running Next.js and NestJS; leave Postgres/Redis containers running.
2. Back up PostgreSQL and **verify** a non-zero backup. Keep private keys and database exports outside shared ZIPs.
3. Extract this patch to a separate folder and run `APPLY_SEEBOT_V1_6_1.cmd`. Choose the actual existing v1.6 source folder. The installer backs up changed files and never touches `.env` or database.
4. Review the changes to `packages/database/prisma/schema.prisma`, including all new relations.
5. Run in your project directory:

   ```powershell
   .\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd db push --schema=packages/database/prisma/schema.prisma
   .\node_modules\.bin\dotenv.cmd --no-expand -e .env -- .\node_modules\.bin\prisma.cmd generate --schema=packages/database/prisma/schema.prisma
   .\node_modules\.bin\dotenv.cmd --no-expand -e .env -- npm.cmd run bootstrap:organization -w @seebot/database
   npm.cmd run typecheck
   npm.cmd run test
   npm.cmd run build
   ```

   If Prisma shows data-loss or reset requests, **decline** and stop. Do not run with force flags. If Prisma client generation reports `EPERM`, close only SalesOS Node processes and retry; keep DB/Redis running.
6. Start `npm.cmd run dev` and check login, Team & Settings (company profile/invitations), My Profile (Gmail), Client Contracts (pricing/signing) and Invoices (numbered PDF).

## API configuration (add only when ready, in private `.env`)

- `GOOGLE_LOGIN_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_LOGIN_CLIENT_ID`: same Google Web Client ID. Allowed JavaScript origin `http://localhost:3000` during local testing.
- `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, `GOOGLE_GMAIL_REDIRECT_URI=http://localhost:4000/api/integrations/gmail/callback`: OAuth web client. Must include the exact callback URI.
- `APP_ENCRYPTION_KEY`: base64-encoded random 32-byte key. Do not change it without a migration of encrypted refresh tokens.
- `GMAIL_SENDING_ENABLED`: defaults `false`; enable only after real Gmail connection and sending/permissions tests.
- For external signing, continue to use separate `GOOGLE_SIGNING_CLIENT_ID`/`NEXT_PUBLIC_SIGNING_GOOGLE_CLIENT_ID`, `SIGNING_AUDIT_KEY`, `SIGNING_PUBLIC_BASE_URL`, and `SIGNING_ENABLED` from v1.6. Never enable with localhost public URLs or without auditing.

The backend must securely store the Gmail refresh token; a Google sign-in session is not permission to read or send emails. A manager's invitation activation will report FAILED if Gmail sending isn't enabled; it must not imply a message was delivered. Use an explicit owner-controlled retry and verify the provider message ID.

## Current test validation

The source-level tests cover stage evidence, demo AI boundaries, signing helpers, token encryption, and integration gates. They do not substitute for Prisma generation, NestJS/Next.js compilation or an end-to-end browser security test.
