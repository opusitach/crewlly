import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, getUserEmployee, isOwnerRole } from "@/lib/auth"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function getAuthorizedInterval(intervalId: string) {
  if (!intervalId || typeof intervalId !== "string") {
    return {
      session: null,
      interval: null,
      employee: null,
      isOwner: false,
      error: "Interval id is required",
      status: 400,
    }
  }
  if (!UUID_REGEX.test(intervalId)) {
    return {
      session: null,
      interval: null,
      employee: null,
      isOwner: false,
      error: "Interval id is invalid",
      status: 400,
    }
  }

  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return { session: null, interval: null, employee: null, isOwner: false, error: "Unauthorized", status: 401 }
  }

  const interval = await prisma.workInterval.findUnique({
    where: { id: intervalId },
    include: {
      workday: { select: { id: true, organizationId: true, locationId: true, workDate: true } },
      position: true,
    },
  })

  if (!interval || interval.workday.organizationId !== session.organization.id) {
    return { session, interval: null, employee: null, isOwner: false, error: "Not found", status: 404 }
  }

  const isOwner = isOwnerRole(session.membership)
  let employee = null
  if (!isOwner) {
    employee = await getUserEmployee(session.user.id, session.organization.id)
    if (!employee || employee.id !== interval.employeeId) {
      return { session, interval, employee: null, isOwner, error: "Forbidden", status: 403 }
    }
  }

  return { session, interval, employee, isOwner, error: null, status: 200 }
}
