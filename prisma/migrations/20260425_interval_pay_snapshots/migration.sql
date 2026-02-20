ALTER TABLE "work_intervals"
  ADD COLUMN IF NOT EXISTS "revenue_cents" INT,
  ADD COLUMN IF NOT EXISTS "calculated_minutes_worked" INT,
  ADD COLUMN IF NOT EXISTS "calculated_gross_pay_cents" INT,
  ADD COLUMN IF NOT EXISTS "pay_calculated_at" TIMESTAMP(3);
