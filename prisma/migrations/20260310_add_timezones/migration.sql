-- Add timezones reference table and enforce organization timezone integrity.

CREATE TABLE IF NOT EXISTS "timezones" (
  "name" TEXT PRIMARY KEY
);

INSERT INTO "timezones" ("name")
SELECT name FROM pg_timezone_names
ON CONFLICT DO NOTHING;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "timezone_needs_review" BOOLEAN NOT NULL DEFAULT false;

UPDATE "organizations"
SET "timezone" = btrim("timezone")
WHERE "timezone" IS NOT NULL AND "timezone" <> btrim("timezone");

UPDATE "organizations"
SET "timezone" = 'Europe/Prague'
WHERE lower(btrim("timezone")) IN (
  'prague',
  'praha',
  'czech',
  'cz',
  'cet',
  'utc+1',
  'gmt+1',
  'utc+01',
  'gmt+01',
  'utc+1:00',
  'gmt+1:00',
  'utc+01:00',
  'gmt+01:00'
);

UPDATE "organizations"
SET "timezone" = 'Europe/Prague',
    "timezone_needs_review" = true
WHERE (
  "timezone" IS NULL
  OR btrim("timezone") = ''
  OR NOT EXISTS (
    SELECT 1 FROM "timezones" WHERE "timezones"."name" = "organizations"."timezone"
  )
)
AND COALESCE(lower(btrim("timezone")), '') NOT IN (
  'prague',
  'praha',
  'czech',
  'cz',
  'cet',
  'utc+1',
  'gmt+1',
  'utc+01',
  'gmt+01',
  'utc+1:00',
  'gmt+1:00',
  'utc+01:00',
  'gmt+01:00'
);

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_timezone_fkey"
  FOREIGN KEY ("timezone") REFERENCES "timezones"("name")
  ON UPDATE CASCADE;
