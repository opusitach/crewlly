-- Internal access session: tracks active internal mode (owner_view / employee_view) selection
-- for an internal user against a specific organization. Active when ended_at IS NULL.
-- Does NOT grant access by itself — final permission is still gated by InternalGlobalAccess.

CREATE TABLE IF NOT EXISTS "internal_access_sessions" (
  "id"               UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "internal_user_id" UUID                  NOT NULL,
  "organization_id"  UUID                  NOT NULL,
  "access_level"     "InternalAccessLevel" NOT NULL,
  "started_at"       TIMESTAMPTZ           NOT NULL DEFAULT now(),
  "ended_at"         TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ           NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ           NOT NULL DEFAULT now(),

  CONSTRAINT "internal_access_sessions_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "internal_access_sessions_user_id_fkey"
    FOREIGN KEY ("internal_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "internal_access_sessions_org_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "internal_access_sessions_internal_user_id_idx"
  ON "internal_access_sessions"("internal_user_id");
CREATE INDEX IF NOT EXISTS "internal_access_sessions_organization_id_idx"
  ON "internal_access_sessions"("organization_id");
CREATE INDEX IF NOT EXISTS "internal_access_sessions_access_level_idx"
  ON "internal_access_sessions"("access_level");
CREATE INDEX IF NOT EXISTS "internal_access_sessions_started_at_idx"
  ON "internal_access_sessions"("started_at");
CREATE INDEX IF NOT EXISTS "internal_access_sessions_ended_at_idx"
  ON "internal_access_sessions"("ended_at");
-- Composite index for the most common lookup: "active session for this user"
CREATE INDEX IF NOT EXISTS "internal_access_sessions_user_active_idx"
  ON "internal_access_sessions"("internal_user_id", "ended_at");
