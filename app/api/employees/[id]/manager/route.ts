import { NextResponse } from "next/server"
import { z } from "zod"
import { getSessionUserWithOrg, isOwnerRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureDefaultRolesAndPermissions } from "@/lib/rbac/default-role-permissions"

const MANAGER_POSITION_NAME = "Менеджер"

const resolveEmployeeId = (params?: { id?: string | string[] }, request?: Request) => {
  const raw = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
  if (raw) return raw
  if (!request) return null
  const parts = new URL(request.url).pathname.split("/")
  return parts.length >= 4 ? parts[parts.length - 2] : null
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isOwnerRole(session.membership)) {
    return NextResponse.json({ error: "Только владелец может назначать менеджера" }, { status: 403 })
  }

  const employeeId = resolveEmployeeId(params, request)
  if (!employeeId || !z.string().uuid().safeParse(employeeId).success) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
  }

  const organizationId = session.organization.id

  const result = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
      },
      select: {
        id: true,
        userId: true,
      },
    })

    if (!employee) {
      return { ok: false as const, status: 404, error: "Сотрудник не найден" }
    }

    const member = await tx.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: employee.userId,
        },
      },
      include: {
        accessRole: {
          select: {
            key: true,
            name: true,
          },
        },
      },
    })

    if (!member?.isActive) {
      return { ok: false as const, status: 404, error: "У сотрудника нет активного доступа к организации" }
    }

    const currentRoleKey = member.accessRole?.key ?? member.legacyRole ?? "worker"
    if (currentRoleKey === "owner") {
      return { ok: false as const, status: 409, error: "Нельзя изменить роль владельца" }
    }

    const employeePositionCount = await tx.employeePosition.count({
      where: { employeeId: employee.id },
    })
    const existingManagerPosition = await tx.position.findFirst({
      where: {
        organizationId,
        name: {
          equals: MANAGER_POSITION_NAME,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        isActive: true,
        sortOrder: true,
      },
    })
    const managerPosition =
      existingManagerPosition == null
        ? await tx.position.create({
            data: {
              organizationId,
              name: MANAGER_POSITION_NAME,
              sortOrder:
                ((await tx.position.findFirst({
                  where: { organizationId, isActive: true },
                  orderBy: { sortOrder: "desc" },
                  select: { sortOrder: true },
                }))?.sortOrder ?? -1) + 1,
            },
            select: {
              id: true,
            },
          })
        : existingManagerPosition.isActive
          ? existingManagerPosition
          : await tx.position.update({
              where: { id: existingManagerPosition.id },
              data: { isActive: true },
              select: {
                id: true,
              },
            })

    await tx.employeePosition.upsert({
      where: {
        employeeId_positionId: {
          employeeId: employee.id,
          positionId: managerPosition.id,
        },
      },
      create: {
        employeeId: employee.id,
        positionId: managerPosition.id,
        isPrimary: employeePositionCount === 0,
      },
      update: {},
    })

    const { managerRole } = await ensureDefaultRolesAndPermissions(tx, organizationId)

    if (currentRoleKey !== "manager") {
      await tx.organizationMember.update({
        where: { id: member.id },
        data: {
          accessRoleId: managerRole.id,
          legacyRole: "manager",
        },
      })
    }

    return {
      ok: true as const,
      data: {
        employeeId: employee.id,
        accessRoleKey: "manager",
        accessRoleName: managerRole.name,
        isManager: true,
        managerPositionId: managerPosition.id,
      },
    }
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ data: result.data })
}
