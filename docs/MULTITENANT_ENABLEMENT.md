# Tenant workspace activation and limits

## Status

SalesOS has a Seebot-only legacy CRM and new organization-owned business APIs. Public tenant access remains **disabled by default**.

- Local fictional-data evaluation: `NODE_ENV=test` (or development), `TENANT_SCOPED_CRM_PREVIEW=true`. New tenant prospects must use reserved `.example`/`.invalid` domains.
- Production activation: `NODE_ENV=production`, `TENANT_SCOPED_CRM_PRODUCTION_ENABLED=true`. This requires an explicit operator change and must **not** be enabled until the security checklist below has been completed.
- `GOOGLE_SELF_SIGNUP_ENABLED=true` permits Google-verified *user* signup if Google OAuth is configured; it does not prove company ownership or grant access to another company's data.

## Required security acceptance

1. Back up the live database and document storage, verify restoration, and migrate/backfill Seebot ownership for every legacy account and task.
2. Verify every record has an appropriate organization and owner. In particular, inspect any nullable `organizationId` fields and audit/repair existing orphan records.
3. Test organization switching, revoked memberships, role changes, expired sessions, guessed IDs, nested relations, file downloads, invoice PDFs, document links and executive reports across unrelated organizations.
4. Confirm every old `AuthGuard` route rejects members with a non-Seebot selected workspace and never reads other organizations' data when a Seebot manager queries global endpoints.
5. Run `scripts/tenant-isolation-e2e.cjs` against disposable PostgreSQL and the headless browser smoke. Repeat adversarial testing under a staging deployment with representative roles and file uploads.
6. Have an independent security review of auth, object-level authorization, background jobs, CORS, CSRF, and external share links before public registration.
7. Enable production access only for an allowlisted pilot organization initially; monitor audit logs and restore/rollback capability.

**Production mode is not itself a certification.** Workflow parity across the legacy Kanban and new tenant business pages remains subject to review; never imply that an unimplemented tenant workflow is available merely because its API gate can be enabled.

## Data restrictions

The legacy Seebot controllers must remain restricted to verified active Seebot members even after production tenants are enabled. Tenant pages use the `workspace-crm`, `workspace-business`, `workspace-finance` and `workspace-tax` APIs; their authorization checks must use persisted membership and record lineage rather than a user-provided organization ID alone.

All real integrations (Google auth, Gmail sending, Apollo, AI) must remain separately opt-in and configured through secure server-side credentials. Do not commit secrets to GitHub.
