# Infrastructure planning

Development Docker Compose runs PostgreSQL and Redis on loopback only. The Next.js and NestJS processes run from the npm workspace.

For staging/production:
1. Deploy Next.js and NestJS behind TLS and a trusted reverse proxy on compatible same-site domains. Confirm cookie SameSite behavior.
2. Deploy managed PostgreSQL with backups, PITR and restoration rehearsals; implement Prisma migrations through deployment CI.
3. Deploy private object storage only after server-side ACL and scanning are implemented.
4. Keep secrets in a managed secrets service, not `.env` in deployed artifacts.
5. Add structured logs, metrics, error monitoring, audit retention, throttling and alerts.
6. Create staging with test accounts and synthetic data, never copies of production personal data without proper handling.
7. Introduce BullMQ notification jobs only when actual reminder or delivery jobs are implemented.
