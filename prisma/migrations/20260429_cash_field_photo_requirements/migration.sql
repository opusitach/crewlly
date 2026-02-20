ALTER TABLE "cash_register_fields"
  ADD COLUMN IF NOT EXISTS "is_photo_required" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "work_interval_procedure_answers"
  ADD COLUMN IF NOT EXISTS "cash_photos_json" JSONB;
