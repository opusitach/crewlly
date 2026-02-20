-- Pay components for combined compensation

DO $$ BEGIN
  CREATE TYPE "PayComponentType" AS ENUM ('hourly', 'fixed_shift', 'percent_revenue');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "employee_pay_components" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "component_type" "PayComponentType" NOT NULL,
  "amount_cents" INT,
  "rate_bp" INT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "priority" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("employee_id", "component_type")
);

CREATE INDEX IF NOT EXISTS "employee_pay_components_employee_id_idx"
  ON "employee_pay_components"("employee_id");

CREATE TABLE IF NOT EXISTS "work_interval_pay_components" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "work_interval_id" UUID NOT NULL REFERENCES "work_intervals"("id") ON DELETE CASCADE,
  "component_type" "PayComponentType" NOT NULL,
  "amount_cents" INT,
  "rate_bp" INT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "priority" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("work_interval_id", "component_type")
);

CREATE INDEX IF NOT EXISTS "work_interval_pay_components_work_interval_id_idx"
  ON "work_interval_pay_components"("work_interval_id");

-- Backfill from legacy employee fields
INSERT INTO "employee_pay_components" ("employee_id", "component_type", "amount_cents", "rate_bp", "is_active", "priority")
SELECT "id", 'hourly', "default_hourly_rate_cents", NULL, true, 0
FROM "employees"
WHERE "pay_type" = 'hourly' AND "default_hourly_rate_cents" IS NOT NULL
ON CONFLICT ("employee_id", "component_type") DO NOTHING;

INSERT INTO "employee_pay_components" ("employee_id", "component_type", "amount_cents", "rate_bp", "is_active", "priority")
SELECT "id", 'fixed_shift', "default_shift_rate_cents", NULL, true, 0
FROM "employees"
WHERE "pay_type" = 'fixed_shift' AND "default_shift_rate_cents" IS NOT NULL
ON CONFLICT ("employee_id", "component_type") DO NOTHING;

INSERT INTO "employee_pay_components" ("employee_id", "component_type", "amount_cents", "rate_bp", "is_active", "priority")
SELECT "id", 'percent_revenue', NULL, "percent_revenue_bp", true, 0
FROM "employees"
WHERE "pay_type" = 'percent_revenue' AND "percent_revenue_bp" IS NOT NULL
ON CONFLICT ("employee_id", "component_type") DO NOTHING;

-- Optional backfill from legacy interval custom fields
INSERT INTO "work_interval_pay_components" ("work_interval_id", "component_type", "amount_cents", "rate_bp", "is_active", "priority")
SELECT "id", 'hourly', "custom_hourly_rate_cents", NULL, true, 0
FROM "work_intervals"
WHERE "use_custom_pay" = true AND "custom_hourly_rate_cents" IS NOT NULL
ON CONFLICT ("work_interval_id", "component_type") DO NOTHING;

INSERT INTO "work_interval_pay_components" ("work_interval_id", "component_type", "amount_cents", "rate_bp", "is_active", "priority")
SELECT "id", 'fixed_shift', "custom_shift_rate_cents", NULL, true, 0
FROM "work_intervals"
WHERE "use_custom_pay" = true AND "custom_shift_rate_cents" IS NOT NULL
ON CONFLICT ("work_interval_id", "component_type") DO NOTHING;

INSERT INTO "work_interval_pay_components" ("work_interval_id", "component_type", "amount_cents", "rate_bp", "is_active", "priority")
SELECT "id", 'percent_revenue', NULL, "custom_percent_revenue_bp", true, 0
FROM "work_intervals"
WHERE "use_custom_pay" = true AND "custom_percent_revenue_bp" IS NOT NULL
ON CONFLICT ("work_interval_id", "component_type") DO NOTHING;
