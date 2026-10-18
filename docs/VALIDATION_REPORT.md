# Verified checks — development environment

**Date:** 2026-10-16

Checks performed against the actual generated source code:

- Node.js available: v22.16.0.
- TypeScript compiler available globally; all TypeScript/TSX source files parsed successfully, with **zero syntax parse diagnostics**.
- Shared pipeline package compiled with TypeScript: `tsc -p packages/shared/tsconfig.json` **PASSED**.
- Node test suite: **4 tests passed / 0 failed** validating shared stage metadata, stage ordering, research evidence and production negotiation fields.
- Source tree and root README generated and inspected.

What was **not** verified:

- npm package installation failed because DNS/network could not reach `registry.npmjs.org` (`EAI_AGAIN`).
- Docker runtime is unavailable in this environment.
- NestJS compilation and Next.js production build cannot be asserted to pass without dependencies.
- Prisma schema migration, API integration tests, and UI E2E tests were not run.

**Do not confuse syntax checks with deployment readiness.** Follow README and build-status launch gates on a machine with network access, Docker, and PostgreSQL.
