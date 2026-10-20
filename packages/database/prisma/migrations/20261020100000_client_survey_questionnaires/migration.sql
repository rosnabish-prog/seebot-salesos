-- Additive questionnaire fields. Does not change historic NPS/CSAT or delete responses.
ALTER TABLE "ClientSurveyInvitation"
  ADD COLUMN IF NOT EXISTS "questions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "answers" JSONB NOT NULL DEFAULT '{}'::jsonb;
