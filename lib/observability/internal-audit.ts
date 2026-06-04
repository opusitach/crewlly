import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { OrganizationAccessContext } from "@/lib/organization-access"

export interface InternalActionParams {
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

/**
 * Action name constants for InternalAuditLog.
 * Use these instead of raw strings to keep action names consistent.
 */
export const INTERNAL_ACTIONS = {
  // Organization-level
  ORGANIZATION_OPEN: "internal.organization.open",
  ORGANIZATION_SETTINGS_UPDATE: "organization.settings.update",
  // Internal access sessions
  INTERNAL_SESSION_START: "internal.session.start",
  INTERNAL_SESSION_END: "internal.session.end",
  // Internal admin panel (admin.crewlly.com)
  // NOTE: writing this is gated on having an organizationId, since the current
  // InternalAuditLog model requires one. A future platform-level audit table can
  // host org-less events without that constraint.
  INTERNAL_ADMIN_OPEN: "internal.admin.open",
  // Employees
  EMPLOYEE_CREATE: "employee.create",
  EMPLOYEE_MANAGER_UPDATE: "employee.manager.update",
  // Positions
  POSITION_CREATE: "position.create",
  POSITION_UPDATE: "position.update",
  POSITION_DELETE: "position.delete",
  POSITION_RULES_CREATE: "position.rules.create",
  POSITION_RULES_UPDATE: "position.rules.update",
  POSITION_RULES_DELETE: "position.rules.delete",
  // Payroll
  PAYROLL_RUN_CREATE: "payroll.run.create",
  // Work intervals
  WORK_INTERVAL_OPEN: "work_interval.open",
  WORK_INTERVAL_CLOSE: "work_interval.close",
  WORK_INTERVAL_OWNER_EDIT: "work_interval.owner_edit",
  // Cash
  CASH_SESSION_CLOSE: "cash_session.close",
} as const

export type InternalAction = (typeof INTERNAL_ACTIONS)[keyof typeof INTERNAL_ACTIONS]

/**
 * Write an audit record for an action taken by an internal user.
 *
 * No-op when access.isInternalAccess is false — safe to call unconditionally
 * after any resolved OrganizationAccessContext.
 *
 * Never throws: a logging failure must not abort the primary action.
 */
export async function logInternalAction(
  access: OrganizationAccessContext,
  params: InternalActionParams,
): Promise<void> {
  if (!access.isInternalAccess) return
  if (!access.internalAccessLevel) return
  if (!access.organizationId) return

  try {
    await prisma.internalAuditLog.create({
      data: {
        internalUserId: access.user.id,
        organizationId: access.organizationId,
        accessLevel: access.internalAccessLevel,
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (error) {
    console.error("[internal-audit] failed to write audit log", {
      action: params.action,
      userId: access.user.id,
      organizationId: access.organizationId,
      error,
    })
  }
}
