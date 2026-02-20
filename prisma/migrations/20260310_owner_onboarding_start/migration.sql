-- Add org draft status + creator and user's active organization tracking.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "status" VARCHAR NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;

UPDATE "organizations"
SET "status" = 'active'
WHERE "status" = 'draft';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "active_organization_id" UUID;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL;

ALTER TABLE "users"
  ADD CONSTRAINT "users_active_organization_id_fkey"
  FOREIGN KEY ("active_organization_id") REFERENCES "organizations"("id")
  ON DELETE SET NULL;
