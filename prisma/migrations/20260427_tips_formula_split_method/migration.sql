ALTER TABLE "locations"
  ADD COLUMN IF NOT EXISTS "tips_split_method" VARCHAR NOT NULL DEFAULT 'equal';

UPDATE "locations"
SET "tips_split_method" = 'equal'
WHERE "tips_split_method" NOT IN ('equal', 'by_hours');

ALTER TABLE "tips_pools"
  ALTER COLUMN "split_method" SET DEFAULT 'equal';

UPDATE "tips_pools"
SET "split_method" = 'equal'
WHERE "split_method" NOT IN ('equal', 'by_hours');

ALTER TABLE "cash_register_formulas"
  ADD COLUMN IF NOT EXISTS "is_tips_source" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "cash_register_formulas_one_tips_source_per_location_uq"
  ON "cash_register_formulas"("location_id")
  WHERE "is_tips_source" = true;
