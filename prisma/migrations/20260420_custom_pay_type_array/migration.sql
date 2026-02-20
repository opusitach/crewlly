-- Allow multiple custom pay types per interval

ALTER TABLE "work_intervals"
  ALTER COLUMN "custom_pay_type" TYPE TEXT[]
  USING CASE
    WHEN "custom_pay_type" IS NULL THEN ARRAY[]::TEXT[]
    ELSE ARRAY["custom_pay_type"]
  END;

ALTER TABLE "work_intervals"
  ALTER COLUMN "custom_pay_type" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "custom_pay_type" SET NOT NULL;
