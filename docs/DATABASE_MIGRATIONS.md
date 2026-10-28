# Versioned database deployment

Do not apply these instructions to a live database without a reviewed backup, restore rehearsal, maintenance/cutover plan and deployment ownership. `db push` is only for disposable experiments. The application does not run migrations at startup.

## Fresh installation

1. Set the target `DATABASE_URL` through managed secrets.
2. Run `npm ci`, then `npm run db:generate`.
3. Review the baseline and incremental SQL in `packages/database/prisma/migrations`.
4. Run `npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma` through deployment CI, then build/start the application.

## Existing database created with db push

1. Take a version-compatible PostgreSQL backup and restore it to isolated staging. Keep the pre-upgrade application image/commit available.
2. On the restored copy, compare schema with the immutable pre-hardening snapshot: `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel packages/database/prisma/baseline.prisma --exit-code`. Stop on any difference; investigate drift rather than replacing the database.
3. Only after a zero-difference comparison, mark the existing baseline as applied: `npx prisma migrate resolve --applied 20261022000000_baseline --schema=packages/database/prisma/schema.prisma`. This records history; it does not create existing tables.
4. Run `prisma migrate deploy`, verify migration status, then compare the upgraded schema with `schema.prisma` and run the full synthetic acceptance suite.
5. Verify existing records/counts, owner memberships, finance balances, document availability and application smoke tests. Pending old login challenges are intentionally expired; users sign in again. Existing account/client/financial records are not rewritten.
6. Rehearse restoring the backup and starting the pre-upgrade image. This is the rollback path; never improvise destructive down-migrations for customer finance records.
7. Repeat the reviewed procedure against the deployment target during the agreed cutover. A CI rehearsal with synthetic data does not authorize or prove a real deployment migration.

`scripts/migration-rehearsal.cjs` enforces a disposable loopback CI database and creates its own temporary databases. It verifies fresh deploy, a seeded pre-hardening database upgraded after baselining, and a restored pre-upgrade backup followed by migration. It needs PostgreSQL `psql`/`pg_dump` clients compatible with the test server. It never applies `db push` or resets the configured application database.
