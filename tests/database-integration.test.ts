import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { PrismaClient } from "@prisma/client"

/**
 * Integration tests for Crewlly DB v2
 * These tests verify the database schema and data integrity.
 * 
 * To run: pnpm test tests/database-integration.test.ts
 */

const prisma = new PrismaClient()
const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip

describeIfDatabase("Database Integration Tests", () => {
  let testOrgId: string
  let testUserId: string
  let testLocationId: string
  let testPositionId: string
  let testEmployeeId: string
  let testWorkdayId: string
  let testIntervalId: string

  beforeAll(async () => {
    await prisma.timezone.createMany({
      data: [{ name: "Europe/Prague" }],
      skipDuplicates: true,
    })
    // Clean up any previous test data
    await prisma.workInterval.deleteMany({ where: { notes: "TEST_DATA" } })
    await prisma.workday.deleteMany({ where: { notes: "TEST_DATA" } })
    await prisma.position.deleteMany({ where: { name: { startsWith: "TEST_" } } })
    await prisma.employee.deleteMany({ where: { employeeCode: "TEST_CODE" } })
    await prisma.location.deleteMany({ where: { name: { startsWith: "TEST_" } } })
    await prisma.organization.deleteMany({ where: { name: { startsWith: "TEST_" } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: "test+" } } })
  })

  afterAll(async () => {
    // Clean up test data
    if (testIntervalId) {
      await prisma.workInterval.deleteMany({ where: { id: testIntervalId } })
    }
    if (testWorkdayId) {
      await prisma.workday.deleteMany({ where: { id: testWorkdayId } })
    }
    if (testEmployeeId) {
      await prisma.employee.deleteMany({ where: { id: testEmployeeId } })
    }
    if (testPositionId) {
      await prisma.position.deleteMany({ where: { id: testPositionId } })
    }
    if (testLocationId) {
      await prisma.location.deleteMany({ where: { id: testLocationId } })
    }
    if (testOrgId) {
      await prisma.organization.deleteMany({ where: { id: testOrgId } })
    }
    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } })
    }
    await prisma.$disconnect()
  })

  describe("Organizations", () => {
    it("should create an organization", async () => {
      const org = await prisma.organization.create({
        data: {
          name: "TEST_Organization",
          timezone: "Europe/Prague",
          currency: "CZK",
        },
      })

      expect(org).toBeDefined()
      expect(org.id).toBeDefined()
      expect(org.name).toBe("TEST_Organization")
      expect(org.timezone).toBe("Europe/Prague")
      expect(org.currency).toBe("CZK")
      testOrgId = org.id
    })
  })

  describe("Users", () => {
    it("should create a user with required fields", async () => {
      const user = await prisma.user.create({
        data: {
          email: "test+user@crewlly.test",
          fullName: "Test User",
          passwordHash: "test_hash_not_real",
          status: "active",
          primaryMode: "owner",
        },
      })

      expect(user).toBeDefined()
      expect(user.id).toBeDefined()
      expect(user.email).toBe("test+user@crewlly.test")
      expect(user.primaryMode).toBe("owner")
      testUserId = user.id
    })

    it("should enforce unique email constraint", async () => {
      await expect(
        prisma.user.create({
          data: {
            email: "test+user@crewlly.test",
            fullName: "Duplicate User",
            passwordHash: "test_hash",
            status: "active",
            primaryMode: "worker",
          },
        })
      ).rejects.toThrow()
    })
  })

  describe("Locations", () => {
    it("should create a location in an organization", async () => {
      const location = await prisma.location.create({
        data: {
          organizationId: testOrgId,
          name: "TEST_Location",
          addressText: "Test Address 123",
        },
      })

      expect(location).toBeDefined()
      expect(location.organizationId).toBe(testOrgId)
      expect(location.name).toBe("TEST_Location")
      expect(location.isActive).toBe(true)
      testLocationId = location.id
    })

    it("should enforce unique (organization_id, name) constraint", async () => {
      await expect(
        prisma.location.create({
          data: {
            organizationId: testOrgId,
            name: "TEST_Location",
            addressText: "Duplicate",
          },
        })
      ).rejects.toThrow()
    })
  })

  describe("Positions", () => {
    it("should create a position in an organization", async () => {
      const position = await prisma.position.create({
        data: {
          organizationId: testOrgId,
          name: "TEST_Waiter",
          sortOrder: 1,
        },
      })

      expect(position).toBeDefined()
      expect(position.organizationId).toBe(testOrgId)
      expect(position.name).toBe("TEST_Waiter")
      expect(position.isActive).toBe(true)
      testPositionId = position.id
    })
  })

  describe("Employees", () => {
    it("should create an employee linked to user and organization", async () => {
      const employee = await prisma.employee.create({
        data: {
          organizationId: testOrgId,
          userId: testUserId,
          employeeCode: "TEST_CODE",
          payType: "hourly",
          defaultHourlyRateCents: 35000, // 350 CZK in cents
          employmentStatus: "active",
        },
      })

      expect(employee).toBeDefined()
      expect(employee.organizationId).toBe(testOrgId)
      expect(employee.userId).toBe(testUserId)
      expect(employee.payType).toBe("hourly")
      expect(employee.defaultHourlyRateCents).toBe(35000)
      testEmployeeId = employee.id

      const payComponent = await prisma.employeePayComponent.create({
        data: {
          employeeId: employee.id,
          componentType: "hourly",
          amountCents: 35000,
        },
      })

      expect(payComponent).toBeDefined()
      expect(payComponent.componentType).toBe("hourly")
      expect(payComponent.amountCents).toBe(35000)
    })

    it("should link employee to position", async () => {
      const employeePosition = await prisma.employeePosition.create({
        data: {
          employeeId: testEmployeeId,
          positionId: testPositionId,
          isPrimary: true,
        },
      })

      expect(employeePosition).toBeDefined()
      expect(employeePosition.isPrimary).toBe(true)
    })

    it("should link employee to location", async () => {
      const employeeLocation = await prisma.employeeLocation.create({
        data: {
          employeeId: testEmployeeId,
          locationId: testLocationId,
          isPrimary: true,
        },
      })

      expect(employeeLocation).toBeDefined()
      expect(employeeLocation.isPrimary).toBe(true)
    })
  })

  describe("Workdays and Intervals", () => {
    it("should create a workday", async () => {
      const workday = await prisma.workday.create({
        data: {
          organizationId: testOrgId,
          locationId: testLocationId,
          workDate: new Date("2026-01-15"),
          status: "draft",
          notes: "TEST_DATA",
          createdByUserId: testUserId,
        },
      })

      expect(workday).toBeDefined()
      expect(workday.status).toBe("draft")
      testWorkdayId = workday.id
    })

    it("should create a work interval with position", async () => {
      const startAt = new Date("2026-01-15T09:00:00Z")
      const endAt = new Date("2026-01-15T17:00:00Z")

      const interval = await prisma.workInterval.create({
        data: {
          workdayId: testWorkdayId,
          employeeId: testEmployeeId,
          positionId: testPositionId,
          startAt,
          endAt,
          status: "scheduled",
          breakMinutes: 30,
          notes: "TEST_DATA",
          createdByUserId: testUserId,
        },
      })

      expect(interval).toBeDefined()
      expect(interval.positionId).toBe(testPositionId)
      expect(interval.breakMinutes).toBe(30)
      expect(interval.status).toBe("scheduled")
      testIntervalId = interval.id
    })

    it("should fetch intervals with employee and position", async () => {
      const interval = await prisma.workInterval.findUnique({
        where: { id: testIntervalId },
        include: {
          employee: {
            include: {
              user: true,
            },
          },
          position: true,
        },
      })

      expect(interval).toBeDefined()
      expect(interval?.employee.user.fullName).toBe("Test User")
      expect(interval?.position?.name).toBe("TEST_Waiter")
    })
  })

  describe("RBAC", () => {
    it("should create access roles for organization", async () => {
      const ownerRole = await prisma.accessRole.create({
        data: {
          organizationId: testOrgId,
          key: "owner",
          name: "Владелец",
          isSystem: true,
        },
      })

      expect(ownerRole).toBeDefined()
      expect(ownerRole.isSystem).toBe(true)

      const workerRole = await prisma.accessRole.create({
        data: {
          organizationId: testOrgId,
          key: "worker",
          name: "Сотрудник",
          isSystem: true,
        },
      })

      expect(workerRole).toBeDefined()
    })

    it("should create organization member with access role", async () => {
      const ownerRole = await prisma.accessRole.findFirst({
        where: { organizationId: testOrgId, key: "owner" },
      })

      const member = await prisma.organizationMember.create({
        data: {
          organizationId: testOrgId,
          userId: testUserId,
          accessRoleId: ownerRole!.id,
          legacyRole: "owner",
        },
      })

      expect(member).toBeDefined()
      expect(member.accessRoleId).toBe(ownerRole!.id)
    })
  })

  describe("Money Values", () => {
    it("should store monetary values in cents", async () => {
      const payComponent = await prisma.employeePayComponent.findFirst({
        where: { employeeId: testEmployeeId, componentType: "hourly" },
      })

      // 350 CZK should be stored as 35000 cents
      expect(payComponent?.amountCents).toBe(35000)
    })

    it("should handle custom pay on intervals", async () => {
      await prisma.workInterval.update({
        where: { id: testIntervalId },
        data: { useCustomPay: true },
      })

      const intervalComponent = await prisma.workIntervalPayComponent.create({
        data: {
          workIntervalId: testIntervalId,
          componentType: "fixed_shift",
          amountCents: 250000, // 2500 CZK
        },
      })

      expect(intervalComponent.componentType).toBe("fixed_shift")
      expect(intervalComponent.amountCents).toBe(250000)
    })
  })

  describe("No Mock Data Check", () => {
    it("should not have any seed/mock employees", async () => {
      const mockEmployees = await prisma.employee.findMany({
        where: {
          employeeCode: {
            in: ["emp-1", "emp-2", "emp-3", "emp-4", "emp-5"],
          },
        },
      })

      expect(mockEmployees.length).toBe(0)
    })

    it("should not have hardcoded workday IDs", async () => {
      const mockWorkdays = await prisma.workday.findMany({
        where: {
          notes: {
            contains: "demo",
            mode: "insensitive",
          },
        },
      })

      expect(mockWorkdays.length).toBe(0)
    })
  })
})
