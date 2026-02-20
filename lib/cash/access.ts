import { getSessionUserWithOrg, getUserEmployee, hasPermission, isOwnerRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
  canManageCash: boolean
}

export type CashAuthResult = CashAuthFailure | CashAuthSuccess

export async function getCashAuthContext(options?: { requireManage?: boolean }): Promise<CashAuthResult> {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    }
  }

  const organizationId = session.organization.id
  const userId = session.user.id
  const owner = isOwnerRole(session.membership)
  const canManageCash = owner || (await hasPermission(userId, organizationId, "cash:manage"))

  if (options?.requireManage && !canManageCash) {
    return {
      ok: false,
      status: 403,
      error: "Недостаточно прав для управления кассой",
    }
  }

  const employee = await getUserEmployee(userId, organizationId)

  return {
    ok: true,
    organizationId,
    userId,
    employeeId: employee?.id ?? null,
    isOwner: owner,
    canManageCash,
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
