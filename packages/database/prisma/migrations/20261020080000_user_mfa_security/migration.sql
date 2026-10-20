-- Seebot SalesOS: additive security fields, no existing user rows deleted.
-- Apply ONLY after the base schema has been established and reviewed in staging.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mfaSecretEncrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "mfaEnabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mfaLastCounter" BIGINT,
  ADD COLUMN IF NOT EXISTS "mfaFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mfaLockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mfaRecoveryCodes" JSONB NOT NULL DEFAULT '[]'::jsonb;
