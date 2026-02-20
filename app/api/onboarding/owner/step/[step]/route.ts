import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { timezoneSchema } from "@/lib/validation/timezone"

const workingHoursSchema = z.object({
  weekday: z.number().min(0).max(6),
  openTime: z.string().optional().nullable(),
  closeTime: z.string().optional().nullable(),
  isClosed: z.boolean().default(false),
})

const positionSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().default(0),
})

const employeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  positions: z.array(z.string()).optional(),
})

const payloadSchema = z.object({
  organizationName: z.string().min(1).optional(),
  locationName: z.string().optional(),
  addressText: z.string().optional(),
  timezone: timezoneSchema.optional(),
  currency: z.string().optional(),
  workingHours: z.array(workingHoursSchema).optional(),
  positions: z.array(positionSchema).optional(),
  employees: z.array(employeeSchema).optional(),
})

const stepSchema = z.object({
  organizationId: z.string().uuid(),
  payload: payloadSchema.optional(),
})

type RouteContext = { params: Promise<{ step: string }> }

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { step: rawStep } = await context.params
  const urlStep = rawStep ?? new URL(request.url).pathname.split("/").pop()
  const step = Number(urlStep)
  if (!Number.isInteger(step) || step < 1 || step > 7) {
    return NextResponse.json({ error: "Invalid step" }, { status: 400 })
  }

  const json = await request.json().catch(() => null)
  const parsed = stepSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { organizationId, payload } = parsed.data

  const membership = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      userId: user.id,
      isActive: true,
      OR: [{ accessRole: { key: "owner" } }, { legacyRole: "owner" }],
    },
  })

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = payload ?? {}

  await prisma.$transaction(async (tx) => {
    if (data.timezone) {
      await tx.timezone.upsert({
        where: { name: data.timezone },
        create: { name: data.timezone },
        update: {},
      })
    }

    if (data.organizationName || data.timezone || data.currency) {
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          name: data.organizationName,
          timezone: data.timezone,
          currency: data.currency,
        },
      })
    }

    let location = await tx.location.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    })

    if (
      !location &&
      (data.locationName || data.organizationName || data.addressText || data.workingHours)
    ) {
      location = await tx.location.create({
        data: {
          organizationId,
          name: data.locationName || data.organizationName || "Основная локация",
          addressText: data.addressText,
        },
      })

      await tx.cashRegister.create({
        data: {
          locationId: location.id,
          name: "Main",
        },
      })
    }

    if (location && (data.locationName || data.addressText)) {
      await tx.location.update({
        where: { id: location.id },
        data: {
          name: data.locationName,
          addressText: data.addressText,
        },
      })
    }

    if (location && data.workingHours && data.workingHours.length > 0) {
      for (const wh of data.workingHours) {
        await tx.locationWorkingHours.upsert({
          where: {
            locationId_weekday: {
              locationId: location.id,
              weekday: wh.weekday,
            },
          },
          create: {
            locationId: location.id,
            weekday: wh.weekday,
            openTime: wh.openTime ? new Date(`1970-01-01T${wh.openTime}:00`) : null,
            closeTime: wh.closeTime ? new Date(`1970-01-01T${wh.closeTime}:00`) : null,
            isClosed: wh.isClosed ?? false,
          },
          update: {
            openTime: wh.openTime ? new Date(`1970-01-01T${wh.openTime}:00`) : null,
            closeTime: wh.closeTime ? new Date(`1970-01-01T${wh.closeTime}:00`) : null,
            isClosed: wh.isClosed ?? false,
          },
        })
      }
    }

    if (data.positions && data.positions.length > 0) {
      for (const pos of data.positions) {
        await tx.position.upsert({
          where: {
            organizationId_name: { organizationId, name: pos.name },
          },
          create: {
            organizationId,
            name: pos.name,
            sortOrder: pos.sortOrder ?? 0,
            isActive: true,
          },
          update: {
            sortOrder: pos.sortOrder ?? 0,
            isActive: true,
          },
        })
      }
    }

    if (data.employees && data.employees.length > 0) {
      const workerRole = await tx.accessRole.findFirst({
        where: { organizationId, key: "worker" },
      })

      const positions = await tx.position.findMany({ where: { organizationId, isActive: true } })
      const positionMap = new Map(positions.map((pos) => [pos.name, pos.id]))

      if (!location) {
        const org = await tx.organization.findUnique({
          where: { id: organizationId },
        })
        location = await tx.location.create({
          data: {
            organizationId,
            name: org?.name || "Основная локация",
          },
        })
      }

      for (const emp of data.employees.slice(0, 50)) {
        if (!emp.name.trim()) continue

        const email = emp.email?.trim()
        if (!email) continue

        let empUser = await tx.user.findUnique({ where: { email } })

        if (!empUser) {
          empUser = await tx.user.create({
            data: {
              email,
              fullName: emp.name,
              phone: emp.phone || null,
              passwordHash: "",
              status: "invited",
              primaryMode: "worker",
            },
          })
        }

        const employee = await tx.employee.upsert({
          where: {
            organizationId_userId: {
              organizationId,
              userId: empUser.id,
            },
          },
          create: {
            organizationId,
            userId: empUser.id,
            payType: "hourly",
            employmentStatus: "active",
          },
          update: {},
        })

        if (location) {
          await tx.employeeLocation.upsert({
            where: {
              employeeId_locationId: {
                employeeId: employee.id,
                locationId: location.id,
              },
            },
            create: {
              employeeId: employee.id,
              locationId: location.id,
              isPrimary: true,
            },
            update: {},
          })
        }

        if (emp.positions && emp.positions.length > 0) {
          for (let i = 0; i < emp.positions.length; i++) {
            const posName = emp.positions[i]
            const positionId = positionMap.get(posName)
            if (!positionId) continue
            await tx.employeePosition.upsert({
              where: {
                employeeId_positionId: {
                  employeeId: employee.id,
                  positionId,
                },
              },
              create: {
                employeeId: employee.id,
                positionId,
                isPrimary: i === 0,
              },
              update: {},
            })
          }
        }

        if (workerRole) {
          await tx.organizationMember.upsert({
            where: {
              organizationId_userId: {
                organizationId,
                userId: empUser.id,
              },
            },
            create: {
              organizationId,
              userId: empUser.id,
              accessRoleId: workerRole.id,
              legacyRole: "worker",
              isActive: true,
              createdVia: "manual",
            },
            update: {},
          })
        }
      }
    }
  })

  return NextResponse.json({ ok: true, step })
}
