import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { DEFAULT_TIMEZONE, timezoneSchema } from "@/lib/validation/timezone"
import { ensureInviteCodeForOrganization } from "@/lib/invite-codes"
import { ensureDefaultRolesAndPermissions } from "@/lib/rbac/default-role-permissions"
import { DEFAULT_PHONE_ERROR_MESSAGE, getPhoneValidationError, normalizePhone } from "@/lib/validation/phone"

const positionSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().default(0),
})

const employeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((value) => value == null || getPhoneValidationError(value) === null, DEFAULT_PHONE_ERROR_MESSAGE),
  positions: z.array(z.string()).optional(),
})

const ownerOnboardingSchema = z.object({
  organizationName: z.string().min(1, "Укажите название заведения"),
  locationName: z.string().optional(),
  addressText: z.string().optional(),
  timezone: timezoneSchema.default(DEFAULT_TIMEZONE),
  currency: z.string().default("CZK"),
  positions: z.array(positionSchema).optional(),
  employees: z.array(employeeSchema).optional(),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get user's organization membership
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, isActive: true },
    include: {
      organization: {
        include: {
          locations: {
            where: { isActive: true },
            include: {
              workingHours: true,
            },
          },
          positions: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  })

  if (!membership) {
    return NextResponse.json({ data: null })
  }

  return NextResponse.json({
    data: {
      organization: membership.organization,
      locations: membership.organization.locations,
      positions: membership.organization.positions,
    },
  })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = ownerOnboardingSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const {
    organizationName,
    locationName,
    addressText,
    timezone,
    currency,
    positions,
    employees,
  } = parsed.data

  // Create organization
  const organization = await prisma.organization.create({
    data: {
      name: organizationName,
      timezone,
      currency,
      status: "active",
      createdByUserId: user.id,
    },
  })

  // Create default location
  const location = await prisma.location.create({
    data: {
      organizationId: organization.id,
      name: locationName || organizationName,
      addressText,
    },
  })

  const { ownerRole } = await prisma.$transaction((tx) => ensureDefaultRolesAndPermissions(tx, organization.id))

  // Create organization member for owner
  await prisma.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      accessRoleId: ownerRole.id,
      legacyRole: "owner",
      createdVia: "manual",
    },
  })

  // Create positions only from user payload (no mock defaults)
  const positionsToCreate =
    positions?.map((position, index) => ({
      name: position.name.trim(),
      sortOrder: position.sortOrder ?? index,
    }))
    .filter((position) => position.name.length > 0) ?? []

  const createdPositions = await Promise.all(
    positionsToCreate.map((pos, idx) =>
      prisma.position.create({
        data: {
          organizationId: organization.id,
          name: pos.name,
          sortOrder: pos.sortOrder ?? idx,
        },
      })
    )
  )

  // Create default cash register for the location
  await prisma.cashRegister.create({
    data: {
      locationId: location.id,
      name: "Main",
    },
  })

  // Create employees if provided
  if (employees && employees.length > 0) {
    const positionMap = new Map(createdPositions.map((p) => [p.name, p.id]))

    for (const emp of employees.slice(0, 50)) {
      if (!emp.name.trim()) continue

      // Check if user with this email already exists
      let empUser = emp.email
        ? await prisma.user.findUnique({ where: { email: emp.email } })
        : null

      // Create placeholder user if email provided but user doesn't exist
      if (emp.email && !empUser) {
        empUser = await prisma.user.create({
          data: {
            email: emp.email,
            fullName: emp.name,
            phone: normalizePhone(emp.phone),
            passwordHash: "", // They'll need to set password via invitation
            status: "invited",
            primaryMode: "worker",
          },
        })
      }

      // If no email, create a placeholder user
      if (!empUser) {
        const placeholderEmail = `placeholder-${Date.now()}-${Math.random().toString(36).slice(2)}@crewlly.local`
        empUser = await prisma.user.create({
          data: {
            email: placeholderEmail,
            fullName: emp.name,
            phone: normalizePhone(emp.phone),
            passwordHash: "",
            status: "invited",
            primaryMode: "worker",
          },
        })
      }

      // Create employee record
      const employee = await prisma.employee.create({
        data: {
          organizationId: organization.id,
          userId: empUser.id,
          payType: "hourly",
          employmentStatus: "active",
        },
      })

      // Link employee to location
      await prisma.employeeLocation.create({
        data: {
          employeeId: employee.id,
          locationId: location.id,
          isPrimary: true,
        },
      })

      // Link employee to positions
      if (emp.positions && emp.positions.length > 0) {
        for (let i = 0; i < emp.positions.length; i++) {
          const posName = emp.positions[i]
          const positionId = positionMap.get(posName)
          if (positionId) {
            await prisma.employeePosition.create({
              data: {
                employeeId: employee.id,
                positionId,
                isPrimary: i === 0,
              },
            })
          }
        }
      }

      // Create organization membership for employee
      const workerRole = await prisma.accessRole.findFirst({
        where: { organizationId: organization.id, key: "worker" },
      })

      await prisma.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: empUser.id,
          accessRoleId: workerRole?.id,
          legacyRole: "worker",
          createdVia: "manual",
        },
      })
    }
  }

  // Update user's primary mode to owner
  await prisma.user.update({
    where: { id: user.id },
    data: {
      primaryMode: "owner",
      onboardingReady: true,
      status: "active",
      activeOrganizationId: organization.id,
    },
  })

  await ensureInviteCodeForOrganization(prisma, organization.id, user.id)

  return NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
    },
    location: {
      id: location.id,
      name: location.name,
    },
    positions: createdPositions,
  })
}
