CREATE TYPE "EmployeeEarningAdjustmentType" AS ENUM ('bonus', 'penalty');

CREATE TABLE "employee_earning_adjustments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "adjustment_type" "EmployeeEarningAdjustmentType" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "comment" TEXT NOT NULL,
  "effective_date" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_earning_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_earning_adjustments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "employee_earning_adjustments_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "employee_earning_adjustments_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "employee_earning_adjustments_organization_id_effective_date_idx"
  ON "employee_earning_adjustments"("organization_id", "effective_date");

CREATE INDEX "employee_earning_adjustments_employee_id_effective_date_idx"
  ON "employee_earning_adjustments"("employee_id", "effective_date");
