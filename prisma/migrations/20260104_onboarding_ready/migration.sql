ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "onboarding_ready" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
ALTER COLUMN "primary_mode" DROP DEFAULT;

ALTER TABLE "users"
ALTER COLUMN "primary_mode" DROP NOT NULL;

UPDATE "users" u
SET "onboarding_ready" = true
WHERE EXISTS (
  SELECT 1
  FROM "organization_members" om
  WHERE om."user_id" = u."id"
    AND om."is_active" = true
);
