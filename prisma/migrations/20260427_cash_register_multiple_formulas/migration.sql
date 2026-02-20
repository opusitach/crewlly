ALTER TABLE "cash_register_formulas"
  ADD COLUMN IF NOT EXISTS "display_order" INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cash_register_formulas_location_id_key'
  ) THEN
    ALTER TABLE "cash_register_formulas"
      DROP CONSTRAINT "cash_register_formulas_location_id_key";
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "cash_register_formulas_location_result_key_uq"
  ON "cash_register_formulas"("location_id", "result_key");

CREATE INDEX IF NOT EXISTS "cash_register_formulas_location_display_order_idx"
  ON "cash_register_formulas"("location_id", "display_order", "created_at");
