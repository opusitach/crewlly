import { prisma } from "@/lib/prisma"
import { getSessionUser, getUserEmployee } from "@/lib/auth"
import {
  resolveOrganizationAccess,
  isOwnerEffectiveRole,
  isOwnerOrManagerEffectiveRole,
} from "@/lib/organization-access"
import {
  resolveEffectiveWorkIntervalClosedAt,
  resolveEffectiveWorkIntervalOpenedAt,
  resolveEffectiveWorkIntervalStatus,
} from "@/lib/work-intervals/status"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function getAuthorizedInterval(intervalId: string) {
  if (!intervalId || typeof intervalId !== "string") {
    return {
      access: null,
      interval: null,
      employee: null,
      isOwner: false,
      hasManagementAccess: false,
      error: "Interval id is required",
      status: 400,
    }
  }
  if (!UUID_REGEX.test(intervalId)) {
    return {
      access: null,
      interval: null,
      employee: null,
      isOwner: false,
      hasManagementAccess: false,
      error: "Interval id is invalid",
      status: 400,
    }
  }

  const user = await getSessionUser()
  if (!user) {
    return {
      access: null,
      interval: null,
      employee: null,
      isOwner: false,
      hasManagementAccess: false,
      error: "Unauthorized",
      status: 401,
    }
  }

  const interval = await prisma.workInterval.findUnique({
    where: { id: intervalId },
    include: {
      workday: { select: { id: true, organizationId: true, locationId: true, workDate: true } },
      position: true,
      timeEntry: {
        select: {
          clockInAt: true,
          clockOutAt: true,
        },
      },
    },
  })

  if (!interval) {
    return {
      access: null,
      interval: null,
      employee: null,
      isOwner: false,
      hasManagementAccess: false,
      error: "Not found",
      status: 404,
    }
  }

  const access = await resolveOrganizationAccess(user.id, interval.workday.organizationId)
  if (!access) {
    return {
      access: null,
      interval: null,
      employee: null,
      isOwner: false,
      hasManagementAccess: false,
      error: "Forbidden",
      status: 403,
    }
  }

  const isOwner = isOwnerEffectiveRole(access)
  const hasManagementAccess = isOwnerOrManagerEffectiveRole(access)
  let employee = null
  if (!hasManagementAccess) {
    employee = await getUserEmployee(user.id, access.organizationId)
    if (!employee || employee.id !== interval.employeeId) {
      return { access, interval, employee: null, isOwner, hasManagementAccess, error: "Forbidden", status: 403 }
    }
  }

  const effectiveStatus = resolveEffectiveWorkIntervalStatus(interval)
  const effectiveOpenedAt = resolveEffectiveWorkIntervalOpenedAt(interval)
  const effectiveClosedAt = resolveEffectiveWorkIntervalClosedAt(interval)

  return {
    access,
    interval,
    employee,
    isOwner,
    hasManagementAccess,
    effectiveStatus,
    effectiveOpenedAt,
    effectiveClosedAt,
    error: null,
    status: 200,
  }
}
