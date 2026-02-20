ALTER TABLE "cash_register_formulas"
  ADD COLUMN IF NOT EXISTS "is_revenue_source" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "cash_register_formulas_one_revenue_source_per_location_uq"
  ON "cash_register_formulas"("location_id")
  WHERE "is_revenue_source" = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cash_register_formulas_single_role_toggle_chk'
  ) THEN
    ALTER TABLE "cash_register_formulas"
      ADD CONSTRAINT "cash_register_formulas_single_role_toggle_chk"
      CHECK (NOT ("is_tips_source" = true AND "is_revenue_source" = true));
  END IF;
END
$$;
