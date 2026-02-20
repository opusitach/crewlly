-- Invite codes for organization onboarding

ALTER TABLE "organization_members"
  ADD COLUMN IF NOT EXISTS "created_via" VARCHAR;

CREATE TABLE IF NOT EXISTS "invitation_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "code_hash" VARCHAR NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'active',
  "expires_at" TIMESTAMPTZ,
  "max_uses" INT,
  "uses_count" INT NOT NULL DEFAULT 0,
  "created_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "invitation_codes_code_hash_key" ON "invitation_codes"("code_hash");
CREATE INDEX IF NOT EXISTS "invitation_codes_org_status_idx" ON "invitation_codes"("organization_id", "status");

CREATE TABLE IF NOT EXISTS "invitation_redemptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invitation_id" UUID NOT NULL REFERENCES "invitation_codes"("id") ON DELETE CASCADE,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redeemed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ip" VARCHAR,
  "user_agent" VARCHAR
);

CREATE INDEX IF NOT EXISTS "invitation_redemptions_invitation_idx" ON "invitation_redemptions"("invitation_id");
CREATE INDEX IF NOT EXISTS "invitation_redemptions_org_user_idx" ON "invitation_redemptions"("organization_id", "user_id");
