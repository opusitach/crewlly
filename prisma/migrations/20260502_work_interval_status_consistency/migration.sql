-- Reconcile work interval lifecycle state with persisted runtime timestamps.
-- This backfill makes status, opened_at/closed_at and time_entries agree after deploy.

UPDATE "work_intervals" wi
SET "opened_at" = te."clock_in_at"
FROM "time_entries" te
WHERE te."work_interval_id" = wi."id"
  AND wi."opened_at" IS NULL
  AND te."clock_in_at" IS NOT NULL;

UPDATE "work_intervals" wi
SET "closed_at" = te."clock_out_at"
FROM "time_entries" te
WHERE te."work_interval_id" = wi."id"
  AND wi."closed_at" IS NULL
  AND te."clock_out_at" IS NOT NULL;

UPDATE "work_intervals"
SET "status" = 'completed'
WHERE "status" <> 'canceled'
  AND "closed_at" IS NOT NULL;

UPDATE "work_intervals"
SET "status" = 'in_progress'
WHERE "status" <> 'canceled'
  AND "opened_at" IS NOT NULL
  AND "closed_at" IS NULL;

UPDATE "work_intervals" wi
SET
  "status" = 'completed',
  "opened_at" = COALESCE(wi."opened_at", te."clock_in_at"),
  "closed_at" = COALESCE(wi."closed_at", te."clock_out_at")
FROM "time_entries" te
WHERE te."work_interval_id" = wi."id"
  AND wi."status" <> 'canceled'
  AND te."clock_out_at" IS NOT NULL;

UPDATE "work_intervals" wi
SET
  "status" = 'in_progress',
  "opened_at" = COALESCE(wi."opened_at", te."clock_in_at")
FROM "time_entries" te
WHERE te."work_interval_id" = wi."id"
  AND wi."status" <> 'canceled'
  AND te."clock_in_at" IS NOT NULL
  AND te."clock_out_at" IS NULL;
