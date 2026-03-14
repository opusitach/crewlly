import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    workday: {
      findMany: vi.fn(),
    },
    workInterval: {
      findMany: vi.fn(),
    },
    employee: {
      findFirst: vi.fn(),
    },
    invitation: {
      findMany: vi.fn(),
    },
    appState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  }

  return {
    prisma,
    getSessionUserWithOrg: vi.fn(),
    getOrganizationReadScope: vi.fn(),
    hasOrganizationActionAccess: vi.fn(),
    logAuditEvent: vi.fn(),
    auditActorFromSession: vi.fn(() => ({ user_id: "user_1" })),
    hashAuditIdentifier: vi.fn((value: string) => `hash:${value}`),
    loadIntervalConflictSummariesByIds: vi.fn(),
    resolveEffectiveWorkIntervalStatus: vi.fn((interval: { status: string }) => interval.status),
    resolveEffectiveWorkIntervalOpenedAt: vi.fn((interval: { openedAt?: Date | null }) => interval.openedAt ?? null),
    resolveEffectiveWorkIntervalClosedAt: vi.fn((interval: { closedAt?: Date | null }) => interval.closedAt ?? null),
    computeIntervalMinutesWorked: vi.fn(() => ({
      effectiveStartAt: new Date("2026-03-10T09:00:00.000Z"),
      effectiveEndAt: new Date("2026-03-10T17:00:00.000Z"),
      usedActualTime: false,
      minutesWorked: 480,
    })),
    computeIntervalPayrollSnapshot: vi.fn(() => ({
      minutesWorked: 480,
      grossPayCents: 10000,
    })),
    syncCashSessionFromWorkdayProcedures: vi.fn(),
    syncWorkdayTipsFromCashSessions: vi.fn(),
    computeEmployeeTipsByWorkdayForEarnings: vi.fn().mockResolvedValue(new Map()),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUserWithOrg: mocked.getSessionUserWithOrg,
  getOrganizationReadScope: mocked.getOrganizationReadScope,
  hasOrganizationActionAccess: mocked.hasOrganizationActionAccess,
}))

vi.mock("@/lib/observability/audit", () => ({
  logAuditEvent: mocked.logAuditEvent,
  auditActorFromSession: mocked.auditActorFromSession,
  hashAuditIdentifier: mocked.hashAuditIdentifier,
}))

vi.mock("@/lib/work-interval-conflicts", () => ({
  loadIntervalConflictSummariesByIds: mocked.loadIntervalConflictSummariesByIds,
}))

vi.mock("@/lib/work-intervals/status", () => ({
  resolveEffectiveWorkIntervalStatus: mocked.resolveEffectiveWorkIntervalStatus,
  resolveEffectiveWorkIntervalOpenedAt: mocked.resolveEffectiveWorkIntervalOpenedAt,
  resolveEffectiveWorkIntervalClosedAt: mocked.resolveEffectiveWorkIntervalClosedAt,
}))

vi.mock("@/lib/payroll/interval-compensation", () => ({
  computeIntervalMinutesWorked: mocked.computeIntervalMinutesWorked,
  computeIntervalPayrollSnapshot: mocked.computeIntervalPayrollSnapshot,
}))

vi.mock("@/lib/cash/session-sync", () => ({
  syncCashSessionFromWorkdayProcedures: mocked.syncCashSessionFromWorkdayProcedures,
}))

vi.mock("@/lib/cash/tips-sync", () => ({
  syncWorkdayTipsFromCashSessions: mocked.syncWorkdayTipsFromCashSessions,
}))

vi.mock("@/lib/cash/earnings-tips", () => ({
  computeEmployeeTipsByWorkdayForEarnings: mocked.computeEmployeeTipsByWorkdayForEarnings,
}))

import { GET as GET_WORKDAYS } from "../app/api/workdays/route"
import { GET as GET_INTERVALS } from "../app/api/intervals/route"
import { GET as GET_EARNINGS } from "../app/api/employees/[id]/earnings/route"
import { GET as GET_INVITATIONS } from "../app/api/invitations/route"
import { GET as GET_STATE, PUT as PUT_STATE } from "../app/api/state/[key]/route"
import { GET as GET_VENUE_SETTINGS } from "../app/api/venues/[venueId]/settings/route"

describe("security read route hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSessionUserWithOrg.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", currency: "CZK", timezone: "Europe/Prague" },
      membership: { isActive: true, legacyRole: "worker" },
    })
    mocked.getOrganizationReadScope.mockResolvedValue({
      scope: "self",
      employeeId: "employee_self",
    })
    mocked.hasOrganizationActionAccess.mockResolvedValue(true)
    mocked.loadIntervalConflictSummariesByIds.mockResolvedValue(new Map())
  })

  it("returns self-scoped workdays without payroll or clock photo leakage", async () => {
    mocked.prisma.workday.findMany.mockResolvedValue([
      {
        id: "workday_1",
        organizationId: "org_1",
        locationId: "loc_1",
        location: { id: "loc_1", name: "Main hall" },
        workDate: new Date("2026-03-10T00:00:00.000Z"),
        status: "draft",
        notes: "Own shift only",
        publishedAt: null,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        workIntervals: [
          {
            id: "interval_1",
            workdayId: "workday_1",
            employeeId: "employee_self",
            positionId: "pos_1",
            position: { id: "pos_1", name: "Бариста" },
            startAt: new Date("2026-03-10T09:00:00.000Z"),
            endAt: new Date("2026-03-10T17:00:00.000Z"),
            status: "scheduled",
            conflictWithIntervalIds: ["other_interval"],
            openedAt: null,
            closedAt: null,
            cancelReason: null,
            useCustomPay: true,
            payComponents: [{ componentType: "hourly", amountCents: 22000, rateBp: null, isActive: true, priority: 1 }],
            customPayType: ["hourly"],
            customHourlyRateCents: 22000,
            customShiftRateCents: null,
            customPercentRevenueBp: null,
            breakMinutes: 30,
            revenueCents: 500000,
            calculatedMinutesWorked: 450,
            calculatedGrossPayCents: 165000,
            payCalculatedAt: new Date("2026-03-10T18:00:00.000Z"),
            notes: "Handle opening",
            employee: {
              id: "employee_self",
              user: { fullName: "Иван", avatarUrl: "avatar.png" },
              employeePositions: [{ position: { id: "pos_1", name: "Бариста" } }],
            },
            timeEntry: {
              id: "entry_1",
              clockInAt: new Date("2026-03-10T08:58:00.000Z"),
              clockOutAt: new Date("2026-03-10T17:01:00.000Z"),
              clockInPhotoUrl: "clock-in.jpg",
              clockOutPhotoUrl: "clock-out.jpg",
            },
          },
        ],
        tipsPool: { id: "tips_1" },
        _count: { workIntervals: 4, cashSessions: 2 },
      },
    ])

    const response = await GET_WORKDAYS(
      new Request("http://localhost/api/workdays?dateFrom=2026-03-01&dateTo=2026-03-31"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocked.prisma.workday.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org_1",
          workIntervals: { some: { employeeId: "employee_self" } },
        }),
        include: expect.objectContaining({
          workIntervals: expect.objectContaining({
            where: { employeeId: "employee_self" },
          }),
        }),
      }),
    )
    expect(mocked.loadIntervalConflictSummariesByIds).not.toHaveBeenCalled()
    expect(body.data[0].tipsPool).toBeNull()
    expect(body.data[0].cashSessionCount).toBe(0)
    expect(body.data[0].intervals[0].payComponents).toEqual([])
    expect(body.data[0].intervals[0].conflicts).toEqual([])
    expect(body.data[0].intervals[0].timeEntry).toEqual({
      id: "entry_1",
      clockInAt: "2026-03-10T08:58:00.000Z",
      clockOutAt: "2026-03-10T17:01:00.000Z",
    })
  })

  it("returns self-scoped intervals without payroll or conflict leakage", async () => {
    mocked.prisma.workInterval.findMany.mockResolvedValue([
      {
        id: "interval_1",
        workdayId: "workday_1",
        workday: {
          id: "workday_1",
          workDate: new Date("2026-03-10T00:00:00.000Z"),
          locationId: "loc_1",
          status: "draft",
        },
        employeeId: "employee_self",
        employee: {
          id: "employee_self",
          user: { fullName: "Иван", avatarUrl: "avatar.png" },
        },
        positionId: "pos_1",
        position: { id: "pos_1", name: "Бариста" },
        startAt: new Date("2026-03-10T09:00:00.000Z"),
        endAt: new Date("2026-03-10T17:00:00.000Z"),
        status: "scheduled",
        conflictWithIntervalIds: ["other_interval"],
        openedAt: null,
        closedAt: null,
        cancelReason: null,
        useCustomPay: true,
        payComponents: [{ componentType: "hourly", amountCents: 22000, rateBp: null, isActive: true, priority: 1 }],
        customPayType: ["hourly"],
        customHourlyRateCents: 22000,
        customShiftRateCents: null,
        customPercentRevenueBp: null,
        breakMinutes: 30,
        revenueCents: 500000,
        calculatedMinutesWorked: 450,
        calculatedGrossPayCents: 165000,
        payCalculatedAt: new Date("2026-03-10T18:00:00.000Z"),
        notes: "Handle opening",
        timeEntry: {
          id: "entry_1",
          clockInAt: new Date("2026-03-10T08:58:00.000Z"),
          clockOutAt: new Date("2026-03-10T17:01:00.000Z"),
          clockInPhotoUrl: "clock-in.jpg",
          clockOutPhotoUrl: "clock-out.jpg",
        },
      },
    ])

    const response = await GET_INTERVALS(
      new Request("http://localhost/api/intervals?employeeId=employee_other"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocked.prisma.workInterval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: "employee_self",
        }),
      }),
    )
    expect(body.data[0].payComponents).toEqual([])
    expect(body.data[0].conflicts).toEqual([])
    expect(body.data[0].timeEntry).toEqual({
      id: "entry_1",
      clockInAt: "2026-03-10T08:58:00.000Z",
      clockOutAt: "2026-03-10T17:01:00.000Z",
    })
  })

  it("blocks workers from reading another employee's earnings", async () => {
    const response = await GET_EARNINGS(
      new Request("http://localhost/api/employees/employee_other/earnings"),
      { params: Promise.resolve({ id: "employee_other" }) },
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe("Недостаточно прав для просмотра начислений")
    expect(mocked.prisma.employee.findFirst).not.toHaveBeenCalled()
  })

  it("omits raw invitation tokens from list responses", async () => {
    mocked.prisma.invitation.findMany.mockResolvedValue([
      {
        id: "inv_1",
        email: "new@example.com",
        token: "secret-token",
        accessRole: { id: "role_1", key: "worker", name: "Сотрудник" },
        location: { id: "loc_1", name: "Main hall" },
        expiresAt: new Date("2026-03-21T00:00:00.000Z"),
        acceptedAt: null,
        createdAt: new Date("2026-03-14T00:00:00.000Z"),
      },
    ])

    const response = await GET_INVITATIONS(
      new Request("http://localhost/api/invitations?status=pending"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data[0].token).toBeUndefined()
    expect(body.data[0].email).toBe("new@example.com")
  })

  it("disables generic app state endpoint", async () => {
    const getResponse = await GET_STATE(
      new Request("http://localhost/api/state/demo"),
      { params: Promise.resolve({ key: "demo" }) },
    )
    const putResponse = await PUT_STATE(
      new Request("http://localhost/api/state/demo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { enabled: true } }),
      }),
      { params: Promise.resolve({ key: "demo" }) },
    )

    expect(getResponse.status).toBe(410)
    expect(putResponse.status).toBe(410)
    expect(mocked.prisma.appState.findUnique).not.toHaveBeenCalled()
    expect(mocked.prisma.appState.upsert).not.toHaveBeenCalled()
  })

  it("requires current organization access for legacy venue settings", async () => {
    const response = await GET_VENUE_SETTINGS(
      new Request("http://localhost/api/venues/org_2/settings"),
      { params: Promise.resolve({ venueId: "org_2" }) },
    )

    expect(response.status).toBe(403)
    expect(mocked.prisma.appState.findUnique).not.toHaveBeenCalled()
  })
})
