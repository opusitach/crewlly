-- Roles & Rules hardening:
-- 1) Ensure procedure enums/tables exist for fresh migration-only databases.
-- 2) Add force open/close override fields.
-- 3) Extend snapshots and answers for retention/audit.
-- 4) Enforce CLOSE templates to be required.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProcedureWhen') THEN
    CREATE TYPE "ProcedureWhen" AS ENUM ('OPEN', 'CLOSE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProcedureRuleType') THEN
    CREATE TYPE "ProcedureRuleType" AS ENUM ('CHECKLIST', 'INPUT', 'PHOTO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Weekday') THEN
    CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "rule_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "position_id" UUID NOT NULL REFERENCES "positions"("id") ON DELETE CASCADE,
  "when" "ProcedureWhen" NOT NULL,
  "type" "ProcedureRuleType" NOT NULL,
  "title" VARCHAR NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "order" INT NOT NULL DEFAULT 0,
  "day_of_week" "Weekday",
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "rule_checklist_item_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_template_id" UUID NOT NULL REFERENCES "rule_templates"("id") ON DELETE CASCADE,
  "title" VARCHAR NOT NULL,
  "order" INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "work_interval_procedures" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "work_interval_id" UUID NOT NULL REFERENCES "work_intervals"("id") ON DELETE CASCADE,
  "when" "ProcedureWhen" NOT NULL,
  "total_required" INT,
  "completed_required" INT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("work_interval_id", "when")
);

CREATE TABLE IF NOT EXISTS "work_interval_procedure_rules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "procedure_id" UUID NOT NULL REFERENCES "work_interval_procedures"("id") ON DELETE CASCADE,
  "template_id" UUID REFERENCES "rule_templates"("id") ON DELETE SET NULL,
  "template_updated_at" TIMESTAMPTZ,
  "type" "ProcedureRuleType" NOT NULL,
  "title" VARCHAR NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "order" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "work_interval_procedure_rule_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_id" UUID NOT NULL REFERENCES "work_interval_procedure_rules"("id") ON DELETE CASCADE,
  "template_item_id" UUID,
  "title" VARCHAR NOT NULL,
  "order" INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "work_interval_procedure_answers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "work_interval_id" UUID NOT NULL REFERENCES "work_intervals"("id") ON DELETE CASCADE,
  "rule_id" UUID NOT NULL REFERENCES "work_interval_procedure_rules"("id") ON DELETE CASCADE,
  "when" "ProcedureWhen" NOT NULL,
  "type" "ProcedureRuleType" NOT NULL,
  "input_value" VARCHAR(150),
  "photo_s3_key" VARCHAR,
  "photo_url" VARCHAR,
  "photo_comment" VARCHAR,
  "photo_deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("work_interval_id", "rule_id")
);

CREATE TABLE IF NOT EXISTS "work_interval_procedure_answer_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "answer_id" UUID NOT NULL REFERENCES "work_interval_procedure_answers"("id") ON DELETE CASCADE,
  "item_id" UUID NOT NULL REFERENCES "work_interval_procedure_rule_items"("id") ON DELETE CASCADE,
  "is_checked" BOOLEAN NOT NULL DEFAULT false,
  UNIQUE ("answer_id", "item_id")
);

CREATE INDEX IF NOT EXISTS "rule_templates_position_when_day_order_idx"
  ON "rule_templates"("position_id", "when", "day_of_week", "order");
CREATE INDEX IF NOT EXISTS "rule_checklist_item_templates_rule_template_id_order_idx"
  ON "rule_checklist_item_templates"("rule_template_id", "order");
CREATE INDEX IF NOT EXISTS "work_interval_procedures_work_interval_id_idx"
  ON "work_interval_procedures"("work_interval_id");
CREATE INDEX IF NOT EXISTS "work_interval_procedure_rules_procedure_id_order_idx"
  ON "work_interval_procedure_rules"("procedure_id", "order");
CREATE INDEX IF NOT EXISTS "work_interval_procedure_rule_items_rule_id_order_idx"
  ON "work_interval_procedure_rule_items"("rule_id", "order");
CREATE INDEX IF NOT EXISTS "work_interval_procedure_answers_work_interval_id_when_idx"
  ON "work_interval_procedure_answers"("work_interval_id", "when");
CREATE INDEX IF NOT EXISTS "work_interval_procedure_answer_items_item_id_idx"
  ON "work_interval_procedure_answer_items"("item_id");

ALTER TABLE "work_intervals"
  ADD COLUMN IF NOT EXISTS "opened_by_owner_id" UUID REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "open_override_reason" VARCHAR,
  ADD COLUMN IF NOT EXISTS "closed_by_owner_id" UUID REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "close_override_reason" VARCHAR;

CREATE INDEX IF NOT EXISTS "work_intervals_opened_by_owner_id_idx"
  ON "work_intervals"("opened_by_owner_id");
CREATE INDEX IF NOT EXISTS "work_intervals_closed_by_owner_id_idx"
  ON "work_intervals"("closed_by_owner_id");

DO $$
BEGIN
  IF to_regclass('"work_interval_procedure_rules"') IS NOT NULL THEN
    ALTER TABLE "work_interval_procedure_rules"
      ADD COLUMN IF NOT EXISTS "template_updated_at" TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"work_interval_procedure_answers"') IS NOT NULL THEN
    ALTER TABLE "work_interval_procedure_answers"
      ADD COLUMN IF NOT EXISTS "photo_comment" VARCHAR,
      ADD COLUMN IF NOT EXISTS "photo_deleted_at" TIMESTAMPTZ;

    UPDATE "work_interval_procedure_answers"
    SET "input_value" = LEFT("input_value", 150)
    WHERE "input_value" IS NOT NULL
      AND LENGTH("input_value") > 150;

    ALTER TABLE "work_interval_procedure_answers"
      ALTER COLUMN "input_value" TYPE VARCHAR(150);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"rule_templates"') IS NOT NULL THEN
    UPDATE "rule_templates"
    SET "required" = true
    WHERE "when" = 'CLOSE'::"ProcedureWhen"
      AND "required" = false;
  END IF;
END $$;
