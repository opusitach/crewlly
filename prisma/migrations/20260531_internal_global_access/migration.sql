-- Internal platform access: isInternal flag on users + InternalGlobalAccess grant model.
-- Internal users are NOT added to OrganizationMember — access is checked separately.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_internal" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "InternalAccessLevel" AS ENUM ('owner_view', 'employee_view');
CREATE TYPE "InternalAccessScope"  AS ENUM ('all_establishments');

CREATE TABLE IF NOT EXISTS "internal_global_access" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      UUID        NOT NULL,
  "access_level" "InternalAccessLevel" NOT NULL,
  "scope"        "InternalAccessScope" NOT NULL DEFAULT 'all_establishments',
  "enabled"      BOOLEAN     NOT NULL DEFAULT true,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "internal_global_access_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "internal_global_access_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Prevent duplicate grants for the same (user, level, scope) triple.
CREATE UNIQUE INDEX IF NOT EXISTS "internal_global_access_user_level_scope_key"
  ON "internal_global_access"("user_id", "access_level", "scope");

CREATE INDEX IF NOT EXISTS "internal_global_access_user_id_idx"
  ON "internal_global_access"("user_id");

CREATE INDEX IF NOT EXISTS "internal_global_access_enabled_idx"
  ON "internal_global_access"("enabled");

CREATE INDEX IF NOT EXISTS "internal_global_access_access_level_idx"
  ON "internal_global_access"("access_level");
