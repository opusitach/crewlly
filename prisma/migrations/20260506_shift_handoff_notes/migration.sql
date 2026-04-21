-- Shift handoff notes: optional comment left by a closing employee for the next shift wave

CREATE TABLE IF NOT EXISTS "shift_handoff_notes" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "author_interval_id"   UUID NOT NULL,
  "location_id"          UUID NOT NULL,
  "author_employee_id"   UUID NOT NULL,
  "author_user_id"       UUID,
  "text"                 TEXT NOT NULL,
  "author_closed_at"     TIMESTAMPTZ NOT NULL,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "shift_handoff_notes_author_interval_fkey"
    FOREIGN KEY ("author_interval_id") REFERENCES "work_intervals"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_handoff_notes_location_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_handoff_notes_author_employee_fkey"
    FOREIGN KEY ("author_employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_handoff_notes_author_user_fkey"
    FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "shift_handoff_notes_author_interval_id_key"
  ON "shift_handoff_notes"("author_interval_id");

CREATE INDEX IF NOT EXISTS "shift_handoff_notes_location_closed_idx"
  ON "shift_handoff_notes"("location_id", "author_closed_at");

CREATE TABLE IF NOT EXISTS "shift_handoff_note_deliveries" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "handoff_note_id" UUID NOT NULL,
  "work_interval_id" UUID NOT NULL,
  "acknowledged_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "shift_handoff_note_deliveries_note_fkey"
    FOREIGN KEY ("handoff_note_id") REFERENCES "shift_handoff_notes"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_handoff_note_deliveries_interval_fkey"
    FOREIGN KEY ("work_interval_id") REFERENCES "work_intervals"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "shift_handoff_note_deliveries_unique"
  ON "shift_handoff_note_deliveries"("handoff_note_id", "work_interval_id");

CREATE INDEX IF NOT EXISTS "shift_handoff_note_deliveries_interval_idx"
  ON "shift_handoff_note_deliveries"("work_interval_id");
