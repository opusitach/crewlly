-- Pending password reset verification flow

CREATE TABLE IF NOT EXISTS "pending_password_resets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR NOT NULL,
  "verification_code_hash" VARCHAR NOT NULL,
  "verification_code_expires_at" TIMESTAMPTZ NOT NULL,
  "verification_attempts" INT NOT NULL DEFAULT 0,
  "resend_count" INT NOT NULL DEFAULT 0,
  "last_sent_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "reset_token_hash" VARCHAR,
  "reset_token_expires_at" TIMESTAMPTZ,
  "verified_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "pending_password_resets_email_key" ON "pending_password_resets"("email");
