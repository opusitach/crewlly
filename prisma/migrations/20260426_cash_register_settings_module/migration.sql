-- Configurable cash module settings:
-- 1) Field templates per location (open/close).
-- 2) Single formula per location.
-- 3) Per-session field value snapshots.
-- 4) DB-level cash session audit log.
-- 5) Cash session lifecycle/extensions for review + owner override.

CREATE TABLE IF NOT EXISTS "cash_register_fields" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "location_id" UUID NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "key" VARCHAR NOT NULL,
  "label" VARCHAR NOT NULL,
  "input_stage" VARCHAR NOT NULL,
  "value_type" VARCHAR NOT NULL DEFAULT 'int_cents',
  "default_sign" INT NOT NULL DEFAULT 1,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "is_revenue_basis" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "display_order" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("location_id", "key")
);

CREATE INDEX IF NOT EXISTS "cash_register_fields_location_stage_active_idx"
  ON "cash_register_fields"("location_id", "input_stage", "is_active");

-- Exactly one active revenue basis field per location (enforced in DB for active rows).
CREATE UNIQUE INDEX IF NOT EXISTS "cash_register_fields_location_revenue_basis_uq"
  ON "cash_register_fields"("location_id")
  WHERE "is_revenue_basis" = true AND "is_active" = true;

CREATE TABLE IF NOT EXISTS "cash_register_formulas" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "location_id" UUID NOT NULL UNIQUE REFERENCES "locations"("id") ON DELETE CASCADE,
  "result_key" VARCHAR NOT NULL DEFAULT 'expected_cash',
  "result_label" VARCHAR NOT NULL DEFAULT 'Ожидаемая наличка',
  "expression" VARCHAR NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cash_session_field_values" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cash_session_id" UUID NOT NULL REFERENCES "cash_sessions"("id") ON DELETE CASCADE,
  "cash_register_field_id" UUID REFERENCES "cash_register_fields"("id") ON DELETE SET NULL,
  "field_key_snapshot" VARCHAR NOT NULL,
  "field_label_snapshot" VARCHAR NOT NULL,
  "input_stage" VARCHAR NOT NULL,
  "is_required_snapshot" BOOLEAN NOT NULL DEFAULT true,
  "value_cents" INT NOT NULL,
  "is_revenue_basis_snapshot" BOOLEAN NOT NULL DEFAULT false,
  "source" VARCHAR NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("cash_session_id", "field_key_snapshot")
);

CREATE INDEX IF NOT EXISTS "cash_session_field_values_session_stage_idx"
  ON "cash_session_field_values"("cash_session_id", "input_stage");

ALTER TABLE "cash_session_field_values"
  ADD COLUMN IF NOT EXISTS "is_required_snapshot" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "cash_session_audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cash_session_id" UUID NOT NULL REFERENCES "cash_sessions"("id") ON DELETE CASCADE,
  "actor_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "action" VARCHAR NOT NULL,
  "reason" VARCHAR,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cash_session_audit_logs_session_created_idx"
  ON "cash_session_audit_logs"("cash_session_id", "created_at");
CREATE INDEX IF NOT EXISTS "cash_session_audit_logs_actor_idx"
  ON "cash_session_audit_logs"("actor_user_id");

ALTER TABLE "cash_sessions"
  ADD COLUMN IF NOT EXISTS "reviewed_by_employee_id" UUID REFERENCES "employees"("id"),
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "formula_expression_snapshot" VARCHAR,
  ADD COLUMN IF NOT EXISTS "formula_result_label_snapshot" VARCHAR,
  ADD COLUMN IF NOT EXISTS "lock_version" INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "owner_edited_by_user_id" UUID REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "owner_edit_reason" VARCHAR;

CREATE INDEX IF NOT EXISTS "cash_sessions_status_idx"
  ON "cash_sessions"("status");
