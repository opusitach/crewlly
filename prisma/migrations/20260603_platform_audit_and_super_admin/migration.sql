-- Stage 12: internal access management from admin.crewlly.com.
--
-- 1. Add the `super_admin` value to the InternalAccessLevel enum. Only the value
--    is added here; it is NOT referenced as a literal in this migration, so it is
--    safe to run inside the migration transaction.
-- 2. Add `platform_audit_logs` — a platform-level (org-less) audit table for
--    administrative actions such as granting/revoking internal access.

ALTER TYPE "InternalAccessLevel" ADD VALUE IF NOT EXISTS 'super_admin';

CREATE TABLE IF NOT EXISTS "platform_audit_logs" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id"  UUID        NOT NULL,
  "target_user_id" UUID,
  "action"         TEXT        NOT NULL,
  "entity_type"    TEXT,
  "entity_id"      UUID,
  "metadata"       JSONB,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_audit_logs_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_audit_logs_target_user_id_fkey"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "platform_audit_logs_actor_user_id_idx"
  ON "platform_audit_logs"("actor_user_id");
CREATE INDEX IF NOT EXISTS "platform_audit_logs_target_user_id_idx"
  ON "platform_audit_logs"("target_user_id");
CREATE INDEX IF NOT EXISTS "platform_audit_logs_action_idx"
  ON "platform_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "platform_audit_logs_created_at_idx"
  ON "platform_audit_logs"("created_at");
