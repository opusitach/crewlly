-- Persist employee-provided cancellation reason for canceled intervals.

ALTER TABLE "work_intervals"
  ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;
