-- Pending registration verification flow

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "pending_registrations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR NOT NULL,
  "full_name" VARCHAR NOT NULL,
  "phone" VARCHAR,
  "password_hash" VARCHAR NOT NULL,
  "verification_code_hash" VARCHAR NOT NULL,
  "verification_code_expires_at" TIMESTAMPTZ NOT NULL,
  "verification_attempts" INT NOT NULL DEFAULT 0,
  "resend_count" INT NOT NULL DEFAULT 0,
  "last_sent_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "pending_registrations_email_key" ON "pending_registrations"("email");
