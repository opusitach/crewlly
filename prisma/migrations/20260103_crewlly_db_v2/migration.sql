-- Crewlly DB v2 Migration
-- This migration transforms the old schema to the new Crewlly DB v2 structure.
-- Money stored in cents, percentages in basis points.
-- 
-- IMPORTANT: Run this migration in a transaction. Backup your data before applying.

-- ==========================================
-- STEP 1: Create new tables (no data loss)
-- ==========================================

-- Organizations (replaces Venue concept)
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR NOT NULL,
  "timezone" VARCHAR NOT NULL DEFAULT 'Europe/Prague',
  "currency" VARCHAR NOT NULL DEFAULT 'CZK',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Locations (within an organization)
CREATE TABLE IF NOT EXISTS "locations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" VARCHAR NOT NULL,
  "address_text" VARCHAR,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organization_id", "name")
);

-- Users (enhanced with primary_mode)
CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR NOT NULL UNIQUE,
  "full_name" VARCHAR,
  "phone" VARCHAR,
  "avatar_url" VARCHAR,
  "locale" VARCHAR NOT NULL DEFAULT 'ru',
  "status" VARCHAR NOT NULL DEFAULT 'active',
  "primary_mode" VARCHAR NOT NULL DEFAULT 'worker',
  "password_hash" VARCHAR NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" VARCHAR NOT NULL UNIQUE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ
);

-- Access Roles (RBAC)
CREATE TABLE IF NOT EXISTS "access_roles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key" VARCHAR NOT NULL,
  "name" VARCHAR NOT NULL,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organization_id", "key"),
  UNIQUE ("organization_id", "name")
);

-- Access Permissions (global catalog)
CREATE TABLE IF NOT EXISTS "access_permissions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR NOT NULL UNIQUE,
  "name" VARCHAR NOT NULL,
  "description" VARCHAR,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Access Role Permissions (m2m)
CREATE TABLE IF NOT EXISTS "access_role_permissions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "access_role_id" UUID NOT NULL REFERENCES "access_roles"("id") ON DELETE CASCADE,
  "permission_id" UUID NOT NULL REFERENCES "access_permissions"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("access_role_id", "permission_id")
);

-- Organization Members
CREATE TABLE IF NOT EXISTS "organization_members" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "access_role_id" UUID REFERENCES "access_roles"("id"),
  "legacy_role" VARCHAR,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "joined_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organization_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "organization_members_org_role_idx" ON "organization_members"("organization_id", "access_role_id");

-- Invitations
CREATE TABLE IF NOT EXISTS "invitations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "location_id" UUID REFERENCES "locations"("id"),
  "email" VARCHAR NOT NULL,
  "access_role_id" UUID REFERENCES "access_roles"("id"),
  "token" VARCHAR NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "accepted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "invitations_org_email_idx" ON "invitations"("organization_id", "email");

-- Employees
CREATE TABLE IF NOT EXISTS "employees" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "employee_code" VARCHAR,
  "employment_status" VARCHAR NOT NULL DEFAULT 'active',
  "hired_at" DATE,
  "terminated_at" DATE,
  "pay_type" VARCHAR NOT NULL DEFAULT 'hourly',
  "default_hourly_rate_cents" INT,
  "default_shift_rate_cents" INT,
  "percent_revenue_bp" INT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organization_id", "user_id")
);

-- Employee Locations
CREATE TABLE IF NOT EXISTS "employee_locations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "location_id" UUID NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("employee_id", "location_id")
);

-- Positions (Jobs)
CREATE TABLE IF NOT EXISTS "positions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "location_id" UUID REFERENCES "locations"("id"),
  "name" VARCHAR NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organization_id", "name")
);

-- Employee Positions
CREATE TABLE IF NOT EXISTS "employee_positions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "position_id" UUID NOT NULL REFERENCES "positions"("id") ON DELETE CASCADE,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("employee_id", "position_id")
);

-- Location Working Hours
CREATE TABLE IF NOT EXISTS "location_working_hours" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "location_id" UUID NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "weekday" INT NOT NULL,
  "open_time" TIME,
  "close_time" TIME,
  "is_closed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("location_id", "weekday")
);

-- Workdays
CREATE TABLE IF NOT EXISTS "workdays" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "location_id" UUID NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "work_date" DATE NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'draft',
  "notes" VARCHAR,
  "published_at" TIMESTAMPTZ,
  "created_by_user_id" UUID REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("location_id", "work_date")
);
CREATE INDEX IF NOT EXISTS "workdays_org_date_idx" ON "workdays"("organization_id", "work_date");

-- Work Intervals
CREATE TABLE IF NOT EXISTS "work_intervals" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workday_id" UUID NOT NULL REFERENCES "workdays"("id") ON DELETE CASCADE,
  "employee_id" UUID NOT NULL REFERENCES "employees"("id") ON DELETE RESTRICT,
  "position_id" UUID REFERENCES "positions"("id"),
  "start_at" TIMESTAMPTZ NOT NULL,
  "end_at" TIMESTAMPTZ NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'scheduled',
  "use_custom_pay" BOOLEAN NOT NULL DEFAULT false,
  "custom_pay_type" VARCHAR,
  "custom_hourly_rate_cents" INT,
  "custom_shift_rate_cents" INT,
  "custom_percent_revenue_bp" INT,
  "break_minutes" INT NOT NULL DEFAULT 0,
  "notes" VARCHAR,
  "created_by_user_id" UUID REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "work_intervals_workday_emp_idx" ON "work_intervals"("workday_id", "employee_id");
CREATE INDEX IF NOT EXISTS "work_intervals_emp_start_idx" ON "work_intervals"("employee_id", "start_at");
CREATE INDEX IF NOT EXISTS "work_intervals_position_idx" ON "work_intervals"("position_id");

-- Time Entries (clock in/out)
CREATE TABLE IF NOT EXISTS "time_entries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "work_interval_id" UUID NOT NULL UNIQUE REFERENCES "work_intervals"("id") ON DELETE CASCADE,
  "employee_id" UUID NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "clock_in_at" TIMESTAMPTZ,
  "clock_out_at" TIMESTAMPTZ,
  "clock_in_photo_url" VARCHAR,
  "clock_out_photo_url" VARCHAR,
  "clock_in_lat" DOUBLE PRECISION,
  "clock_in_lng" DOUBLE PRECISION,
  "clock_out_lat" DOUBLE PRECISION,
  "clock_out_lng" DOUBLE PRECISION,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "time_entries_emp_clock_idx" ON "time_entries"("employee_id", "clock_in_at");

-- Tips Pools
CREATE TABLE IF NOT EXISTS "tips_pools" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workday_id" UUID NOT NULL UNIQUE REFERENCES "workdays"("id") ON DELETE CASCADE,
  "total_amount_cents" INT NOT NULL DEFAULT 0,
  "split_method" VARCHAR NOT NULL DEFAULT 'by_hours',
  "notes" VARCHAR,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tip Allocations
CREATE TABLE IF NOT EXISTS "tip_allocations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tips_pool_id" UUID NOT NULL REFERENCES "tips_pools"("id") ON DELETE CASCADE,
  "employee_id" UUID NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "amount_cents" INT NOT NULL DEFAULT 0,
  "minutes_counted" INT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("tips_pool_id", "employee_id")
);

-- Cash Registers
CREATE TABLE IF NOT EXISTS "cash_registers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "location_id" UUID NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "name" VARCHAR NOT NULL DEFAULT 'Main',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("location_id", "name")
);

-- Cash Sessions
CREATE TABLE IF NOT EXISTS "cash_sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cash_register_id" UUID NOT NULL REFERENCES "cash_registers"("id") ON DELETE CASCADE,
  "workday_id" UUID NOT NULL REFERENCES "workdays"("id") ON DELETE CASCADE,
  "opened_by_employee_id" UUID REFERENCES "employees"("id"),
  "closed_by_employee_id" UUID REFERENCES "employees"("id"),
  "opened_at" TIMESTAMPTZ,
  "closed_at" TIMESTAMPTZ,
  "opening_cash_cents" INT NOT NULL DEFAULT 0,
  "closing_cash_cents" INT NOT NULL DEFAULT 0,
  "expected_cash_cents" INT NOT NULL DEFAULT 0,
  "diff_cash_cents" INT NOT NULL DEFAULT 0,
  "status" VARCHAR NOT NULL DEFAULT 'open',
  "notes" VARCHAR,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("cash_register_id", "workday_id")
);
CREATE INDEX IF NOT EXISTS "cash_sessions_workday_idx" ON "cash_sessions"("workday_id");

-- Receipt Uploads
CREATE TABLE IF NOT EXISTS "receipt_uploads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cash_session_id" UUID NOT NULL REFERENCES "cash_sessions"("id") ON DELETE CASCADE,
  "uploaded_by_employee_id" UUID REFERENCES "employees"("id"),
  "photo_url" VARCHAR NOT NULL,
  "receipt_type" VARCHAR NOT NULL DEFAULT 'z_report',
  "total_amount_cents" INT,
  "taken_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "receipt_uploads_session_idx" ON "receipt_uploads"("cash_session_id");

-- Comments
CREATE TABLE IF NOT EXISTS "comments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "entity_type" VARCHAR NOT NULL,
  "entity_id" UUID NOT NULL,
  "author_user_id" UUID REFERENCES "users"("id"),
  "text" VARCHAR NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "comments_org_entity_idx" ON "comments"("organization_id", "entity_type", "entity_id");

-- Payroll Runs
CREATE TABLE IF NOT EXISTS "payroll_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'draft',
  "created_by_user_id" UUID REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finalized_at" TIMESTAMPTZ
);

-- Payroll Items
CREATE TABLE IF NOT EXISTS "payroll_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "payroll_run_id" UUID NOT NULL REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
  "employee_id" UUID NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "minutes_worked" INT NOT NULL DEFAULT 0,
  "gross_pay_cents" INT NOT NULL DEFAULT 0,
  "tips_cents" INT NOT NULL DEFAULT 0,
  "total_payout_cents" INT NOT NULL DEFAULT 0,
  "note" VARCHAR,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("payroll_run_id", "employee_id")
);

-- App States (for client store persistence)
CREATE TABLE IF NOT EXISTS "app_states" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR NOT NULL UNIQUE,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- STEP 2: Insert default permissions
-- ==========================================

INSERT INTO "access_permissions" ("key", "name", "description") VALUES
  ('workday:create', 'Create Workday', 'Can create workdays'),
  ('workday:edit', 'Edit Workday', 'Can edit workdays'),
  ('workday:publish', 'Publish Workday', 'Can publish workdays'),
  ('workday:delete', 'Delete Workday', 'Can delete workdays'),
  ('interval:create', 'Create Interval', 'Can create work intervals'),
  ('interval:edit', 'Edit Interval', 'Can edit work intervals'),
  ('interval:delete', 'Delete Interval', 'Can delete work intervals'),
  ('employee:view', 'View Employees', 'Can view employees'),
  ('employee:create', 'Create Employee', 'Can create employees'),
  ('employee:edit', 'Edit Employee', 'Can edit employees'),
  ('employee:delete', 'Delete Employee', 'Can delete employees'),
  ('cash:view', 'View Cash', 'Can view cash sessions'),
  ('cash:manage', 'Manage Cash', 'Can manage cash sessions'),
  ('tips:view', 'View Tips', 'Can view tips'),
  ('tips:manage', 'Manage Tips', 'Can manage tips'),
  ('payroll:view', 'View Payroll', 'Can view payroll'),
  ('payroll:manage', 'Manage Payroll', 'Can manage payroll'),
  ('settings:view', 'View Settings', 'Can view settings'),
  ('settings:manage', 'Manage Settings', 'Can manage organization settings'),
  ('reports:view', 'View Reports', 'Can view reports')
ON CONFLICT ("key") DO NOTHING;

-- ==========================================
-- STEP 3: Data migration from old tables (if they exist)
-- ==========================================

-- Migrate from old User table to new users table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'User') THEN
    -- Check if users table has data or needs migration
    IF NOT EXISTS (SELECT 1 FROM "users" LIMIT 1) THEN
      INSERT INTO "users" ("id", "email", "full_name", "password_hash", "status", "primary_mode", "created_at", "updated_at")
      SELECT 
        id::uuid,
        email,
        name,
        "passwordHash",
        CASE WHEN "onboardingStatus" = 'COMPLETED' THEN 'active' ELSE 'invited' END,
        CASE WHEN role = 'OWNER' THEN 'owner' ELSE 'worker' END,
        "createdAt",
        "updatedAt"
      FROM "User"
      WHERE email IS NOT NULL AND "passwordHash" IS NOT NULL
      ON CONFLICT ("email") DO NOTHING;
    END IF;
  END IF;
END $$;

-- Migrate from old Venue to organizations + locations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Venue') THEN
    -- Create organizations from venues
    INSERT INTO "organizations" ("id", "name", "timezone", "currency", "created_at", "updated_at")
    SELECT 
      id::uuid,
      name,
      COALESCE(timezone, 'Europe/Prague'),
      COALESCE(currency, 'CZK'),
      "createdAt",
      "updatedAt"
    FROM "Venue"
    ON CONFLICT DO NOTHING;
    
    -- Create locations from venues (1:1 mapping initially)
    INSERT INTO "locations" ("id", "organization_id", "name", "address_text", "created_at", "updated_at")
    SELECT 
      id::uuid,
      id::uuid,
      name,
      COALESCE(address, city),
      "createdAt",
      "updatedAt"
    FROM "Venue"
    ON CONFLICT DO NOTHING;
    
    -- Create organization members for venue owners
    INSERT INTO "organization_members" ("organization_id", "user_id", "legacy_role")
    SELECT 
      v.id::uuid,
      v."ownerId"::uuid,
      'owner'
    FROM "Venue" v
    WHERE v."ownerId" IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Migrate sessions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Session') THEN
    INSERT INTO "sessions" ("id", "token", "user_id", "created_at", "expires_at")
    SELECT 
      id::uuid,
      token,
      "userId"::uuid,
      "createdAt",
      "expiresAt"
    FROM "Session"
    WHERE EXISTS (SELECT 1 FROM "users" WHERE id::text = "userId")
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Migrate old employees
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Employee') THEN
    -- For employees without user_id, we need to create placeholder users
    -- or skip them (depends on business logic)
    -- For now, we skip employees without proper user association
    -- The new system requires employees to be linked to users
    NULL;
  END IF;
END $$;

-- ==========================================
-- STEP 4: Create default positions for each organization
-- ==========================================

INSERT INTO "positions" ("organization_id", "name", "sort_order")
SELECT o.id, p.name, p.sort_order
FROM "organizations" o
CROSS JOIN (
  VALUES 
    ('Бармен', 1),
    ('Официант', 2),
    ('Менеджер', 3),
    ('Повар', 4),
    ('Хостес', 5)
) AS p(name, sort_order)
ON CONFLICT ("organization_id", "name") DO NOTHING;

-- ==========================================
-- STEP 5: Create default access roles for each organization
-- ==========================================

INSERT INTO "access_roles" ("organization_id", "key", "name", "is_system")
SELECT o.id, r.key, r.name, true
FROM "organizations" o
CROSS JOIN (
  VALUES 
    ('owner', 'Владелец'),
    ('manager', 'Менеджер'),
    ('worker', 'Сотрудник')
) AS r(key, name)
ON CONFLICT ("organization_id", "key") DO NOTHING;

-- ==========================================
-- STEP 6: Assign permissions to default roles
-- ==========================================

-- Owner gets all permissions
INSERT INTO "access_role_permissions" ("access_role_id", "permission_id")
SELECT ar.id, ap.id
FROM "access_roles" ar
CROSS JOIN "access_permissions" ap
WHERE ar.key = 'owner'
ON CONFLICT ("access_role_id", "permission_id") DO NOTHING;

-- Manager gets most permissions except settings:manage and payroll:manage
INSERT INTO "access_role_permissions" ("access_role_id", "permission_id")
SELECT ar.id, ap.id
FROM "access_roles" ar
CROSS JOIN "access_permissions" ap
WHERE ar.key = 'manager' 
  AND ap.key NOT IN ('settings:manage', 'payroll:manage', 'employee:delete')
ON CONFLICT ("access_role_id", "permission_id") DO NOTHING;

-- Worker gets view-only permissions
INSERT INTO "access_role_permissions" ("access_role_id", "permission_id")
SELECT ar.id, ap.id
FROM "access_roles" ar
CROSS JOIN "access_permissions" ap
WHERE ar.key = 'worker' 
  AND ap.key IN ('employee:view', 'cash:view', 'tips:view')
ON CONFLICT ("access_role_id", "permission_id") DO NOTHING;

-- ==========================================
-- STEP 7: Update organization_members with access_role_id based on legacy_role
-- ==========================================

UPDATE "organization_members" om
SET "access_role_id" = ar.id
FROM "access_roles" ar
WHERE om."organization_id" = ar."organization_id"
  AND om."legacy_role" = ar."key"
  AND om."access_role_id" IS NULL;

-- ==========================================
-- Migration complete
-- ==========================================

