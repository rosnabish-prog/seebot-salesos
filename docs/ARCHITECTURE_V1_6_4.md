# Architecture map — v1.6.4

This milestone preserves the original single-Seebot CRM and introduces **modular commercial and organization services**. The existing legacy controllers have NOT been globally refactored for multi-tenancy.

## Trust boundaries

- `IdentityGuard`: validates platform session for organization setup endpoints; does not grant CRM access.
- `AuthGuard`: validates user and password version, active Seebot membership, rejects any selected non-Seebot workspace on legacy CRM endpoints.
- New customer profiles have `status=SETUP`, not enabled CRM access. Do not remove the gate before complete tenant-aware query migrations and integration tests.
- Never use a claimed organization ID from request JSON as authorization. Resolve permitted tenant from authenticated session + active membership, then restrict every query to it.

## Commercial responsibilities

- Contract amendment contains a version and **pricing snapshot**; commercial approval is not proof of client execution.
- Signatory contains a requested role/order; a signing invitation and actual cryptographic audit are separate lifecycle facts.
- Invoice adjustment becomes approved after manager review; credit note PDF has a separate issuance record and number. Accountant should review treatment before use.
- Billing schedule generation prepares a `DRAFT` and uses a persistent automation event key to avoid duplicates; there is no live invoice issuance in automation.
- `DeliveryMilestone` stores accepted work evidence references and responsible account.
- Executive drilldowns return specific records; demo and live records are separate.

## Extensibility

OpenAI, Apollo, Gmail and Google identity remain separate integration modules. Provider keys belong in secure backend environment variables, never browser props. The demo mode stays explicit. Each outbound email requires an actual Gmail connection and a verified sending workflow; no test action may send an email accidentally.

## Before production

Add tenant ID to legacy business entities and enforce it across all CRUD, file access, reporting and background tasks; review ownership roles at tenant level, prevent session-wide role escalation, add schema/data migration and cross-tenant adversarial tests, secure signing audit retention independently, and run full builds and browser tests.
