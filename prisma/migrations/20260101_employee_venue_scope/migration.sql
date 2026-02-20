-- This migration scopes data correctly:
-- - One Venue per owner account (unique ownerId, FK to User)
-- - Employees belong to a Venue (venueId FK) and store minimal fields used by UI (role/pay)
--
-- Apply on PostgreSQL (example):
--   psql "$DATABASE_URL" -f prisma/migrations/20260101_employee_venue_scope/migration.sql

-- Venue.ownerId uniqueness + FK to User
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Venue'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Venue_ownerId_key'
    ) THEN
      ALTER TABLE "Venue" ADD CONSTRAINT "Venue_ownerId_key" UNIQUE ("ownerId");
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Venue'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'User'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Venue_ownerId_fkey'
    ) THEN
      ALTER TABLE "Venue"
        ADD CONSTRAINT "Venue_ownerId_fkey"
        FOREIGN KEY ("ownerId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

-- Employee: add venueId + role/pay fields
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Employee'
  ) THEN
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "venueId" TEXT;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "role" TEXT;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "payType" TEXT;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "payValue" NUMERIC(12,2);
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "payCurrency" TEXT;
  END IF;
END $$;

-- Employee.venueId FK to Venue
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Employee'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Venue'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Employee_venueId_fkey'
    ) THEN
      ALTER TABLE "Employee"
        ADD CONSTRAINT "Employee_venueId_fkey"
        FOREIGN KEY ("venueId") REFERENCES "Venue"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Employee'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Employee_venueId_idx" ON "Employee"("venueId");
  END IF;
END $$;

