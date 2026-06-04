import { getSessionUser, getUserEmployee } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  resolveOrganizationAccess,
  isOwnerEffectiveRole,
  isOwnerOrManagerEffectiveRole,
  hasEffectivePermission,
  type OrganizationAccessContext,
} from "@/lib/organization-access"

type CashAuthFailure = {
  ok: false
  status: number
  error: string
}

type CashAuthSuccess = {
  ok: true
  organizationId: string
  userId: string
  employeeId: string | null
  isOwner: boolean
  isManagementRole: boolean
  canManageCash: boolean
  /** Full access context — use for logInternalAction when isInternalAccess is true */
  access: OrganizationAccessContext
}

export type CashAuthResult = CashAuthFailure | CashAuthSuccess

export async function getCashAuthContext(options?: {
  requireManage?: boolean
  organizationId?: string
}): Promise<CashAuthResult> {
  const user = await getSessionUser()
  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    }
  }

  const organizationId = options?.organizationId ?? user.activeOrganizationId
  if (!organizationId) {
    return {
      ok: false,
      status: 400,
      error: "Organization not selected",
    }
  }

  const access = await resolveOrganizationAccess(user.id, organizationId)
  if (!access) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
    }
  }

  const managementRole = isOwnerOrManagerEffectiveRole(access)
  const canManageCash = managementRole || hasEffectivePermission(access, "cash:manage")

  if (options?.requireManage && !canManageCash) {
    return {
      ok: false,
      status: 403,
      error: "Недостаточно прав для управления кассой",
    }
  }

  const employee = await getUserEmployee(user.id, organizationId)

  return {
    ok: true,
    organizationId,
    userId: user.id,
    employeeId: employee?.id ?? null,
    isOwner: isOwnerEffectiveRole(access),
    isManagementRole: managementRole,
    canManageCash,
    access,
  }
}

export async function resolveOrganizationLocationId(
  organizationId: string,
  requestedLocationId?: string | null,
): Promise<{ ok: true; locationId: string } | { ok: false; error: string; status: number }> {
  if (requestedLocationId) {
    const location = await prisma.location.findFirst({
      where: {
        id: requestedLocationId,
        organizationId,
        isActive: true,
      },
      select: { id: true },
    })

    if (!location) {
      return {
        ok: false,
        status: 404,
        error: "Локация не найдена",
      }
    }

    return {
      ok: true,
      locationId: location.id,
    }
  }

  const firstLocation = await prisma.location.findFirst({
    where: {
      organizationId,
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })

  if (!firstLocation) {
    return {
      ok: false,
      status: 404,
      error: "В организации нет активных локаций",
    }
  }

  return {
    ok: true,
    locationId: firstLocation.id,
  }
}
