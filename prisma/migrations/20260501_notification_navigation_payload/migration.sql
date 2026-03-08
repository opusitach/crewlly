-- Add deep-link payload to notifications

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "payload" JSONB;
