-- Bring work_intervals table in sync with Prisma schema.
-- Required for API endpoints that read/write openedAt and closedAt fields.

ALTER TABLE "work_intervals"
  ADD COLUMN IF NOT EXISTS "opened_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ;
