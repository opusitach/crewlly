-- Align work interval statuses with the updated workflow and persist conflict links.

ALTER TABLE "work_intervals"
  ADD COLUMN IF NOT EXISTS "conflict_with_interval_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Status migration for existing data.
UPDATE "work_intervals"
SET "status" = 'scheduled'
WHERE "status" = 'draft';

UPDATE "work_intervals"
SET "status" = 'in_progress'
WHERE "status" = 'confirmed';
