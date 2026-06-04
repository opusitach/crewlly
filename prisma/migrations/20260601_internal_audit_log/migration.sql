-- InternalAuditLog: persist every mutating action taken by internal users inside an organisation.
-- Only written when OrganizationAccessContext.isInternalAccess = true.
-- NOT readable by venue owners or regular members — reserved for admin.crewlly.com.

CREATE TABLE IF NOT EXISTS "internal_audit_logs" (
  "id"               UUID                   NOT NULL DEFAULT gen_random_uuid(),
  "internal_user_id" UUID                   NOT NULL,
  "organization_id"  UUID                   NOT NULL,
  "access_level"     "InternalAccessLevel"  NOT NULL,
  "action"           TEXT                   NOT NULL,
  "entity_type"      TEXT,
  "entity_id"        TEXT,
  "metadata"         JSONB,
  "created_at"       TIMESTAMPTZ            NOT NULL DEFAULT now(),

  CONSTRAINT "internal_audit_logs_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "internal_audit_logs_internal_user_id_fkey"
    FOREIGN KEY ("internal_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "internal_audit_logs_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "internal_audit_logs_internal_user_id_idx"
  ON "internal_audit_logs"("internal_user_id");

CREATE INDEX IF NOT EXISTS "internal_audit_logs_organization_id_idx"
  ON "internal_audit_logs"("organization_id");

CREATE INDEX IF NOT EXISTS "internal_audit_logs_access_level_idx"
  ON "internal_audit_logs"("access_level");

CREATE INDEX IF NOT EXISTS "internal_audit_logs_action_idx"
  ON "internal_audit_logs"("action");

CREATE INDEX IF NOT EXISTS "internal_audit_logs_created_at_idx"
  ON "internal_audit_logs"("created_at");
