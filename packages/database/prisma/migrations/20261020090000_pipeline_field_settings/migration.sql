-- Additive only. Review against a current staging database and existing migration history.
ALTER TABLE "WorkspaceSettings"
  ADD COLUMN IF NOT EXISTS "pipelineConfig" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "pipelineVersion" INTEGER NOT NULL DEFAULT 1;
