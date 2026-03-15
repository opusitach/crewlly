import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    workInterval: {
      findMany: vi.fn(),
    },
    workIntervalPayComponent: {
      findMany: vi.fn(),
    },
    employeePayComponent: {
      findMany: vi.fn(),
    },
    employeeEarningAdjustment: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    prisma,
    computeIntervalMinutesWorked: vi.fn(),
    computeIntervalPayrollSnapshot: vi.fn(),
    syncCashSessionFromWorkdayProcedures: vi.fn(),
    syncWorkdayTipsFromCashSessions: vi.fn(),
    computeEmployeeTipsByWorkdayForEarnings: vi.fn(),
    resolveEffectiveWorkIntervalStatus: vi.fn((interval: { status: string }) => interval.status),
    resolveEffectiveWorkIntervalOpenedAt: vi.fn((interval: { openedAt?: Date | null }) => interval.openedAt ?? null),
    resolveEffectiveWorkIntervalClosedAt: vi.fn((interval: { closedAt?: Date | null }) => interval.closedAt ?? null),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
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

vi.mock("@/lib/work-intervals/status", () => ({
  resolveEffectiveWorkIntervalStatus: mocked.resolveEffectiveWorkIntervalStatus,
  resolveEffectiveWorkIntervalOpenedAt: mocked.resolveEffectiveWorkIntervalOpenedAt,
  resolveEffectiveWorkIntervalClosedAt: mocked.resolveEffectiveWorkIntervalClosedAt,
}))

import { computeEmployeeEarnings } from "../lib/payroll/earnings"

describe("computeEmployeeEarnings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mocked.prisma.workIntervalPayComponent.findMany.mockResolvedValue([])
    mocked.prisma.employeePayComponent.findMany.mockResolvedValue([])
    mocked.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({}))
    mocked.computeEmployeeTipsByWorkdayForEarnings.mockResolvedValue(new Map([["workday_1", 2500]]))
    mocked.computeIntervalMinutesWorked.mockReturnValue({
      effectiveStartAt: new Date("2026-03-10T09:00:00.000Z"),
      effectiveEndAt: new Date("2026-03-10T17:00:00.000Z"),
      usedActualTime: true,
      minutesWorked: 480,
    })
  })

  it("merges shifts with bonus and penalty adjustments into summary and history", async () => {
    mocked.prisma.workInterval.findMany.mockResolvedValue([
      {
        id: "interval_1",
        workdayId: "workday_1",
        workday: {
          id: "workday_1",
          workDate: new Date("2026-03-10T00:00:00.000Z"),
          locationId: "loc_1",
          status: "published",
        },
        employeeId: "employee_1",
        position: { name: "Бариста" },
        startAt: new Date("2026-03-10T09:00:00.000Z"),
        endAt: new Date("2026-03-10T17:00:00.000Z"),
        status: "completed",
        openedAt: new Date("2026-03-10T09:00:00.000Z"),
        closedAt: new Date("2026-03-10T17:00:00.000Z"),
        breakMinutes: 30,
        useCustomPay: false,
        revenueCents: null,
        calculatedMinutesWorked: 480,
        calculatedGrossPayCents: 10000,
        payCalculatedAt: new Date("2026-03-10T17:05:00.000Z"),
        createdAt: new Date("2026-03-10T08:00:00.000Z"),
        timeEntry: {
          clockInAt: new Date("2026-03-10T09:00:00.000Z"),
          clockOutAt: new Date("2026-03-10T17:00:00.000Z"),
        },
      },
    ])

    mocked.prisma.employeeEarningAdjustment.findMany.mockResolvedValue([
      {
        id: "adjustment_bonus",
        organizationId: "org_1",
        employeeId: "employee_1",
        createdByUserId: "owner_1",
        adjustmentType: "bonus",
        amountCents: 1000,
        comment: "За инициативу",
        effectiveDate: new Date("2026-03-15T00:00:00.000Z"),
        createdAt: new Date("2026-03-15T12:00:00.000Z"),
        updatedAt: new Date("2026-03-15T12:00:00.000Z"),
      },
      {
        id: "adjustment_penalty",
        organizationId: "org_1",
        employeeId: "employee_1",
        createdByUserId: "owner_1",
        adjustmentType: "penalty",
        amountCents: 400,
        comment: "За опоздание",
        effectiveDate: new Date("2026-03-14T00:00:00.000Z"),
        createdAt: new Date("2026-03-14T10:00:00.000Z"),
        updatedAt: new Date("2026-03-14T10:00:00.000Z"),
      },
    ])

    const result = await computeEmployeeEarnings({
      organizationId: "org_1",
      employeeId: "employee_1",
      organizationTimezone: "Europe/Prague",
      organizationCurrency: "CZK",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
    })

    expect(result.summary).toEqual(
      expect.objectContaining({
        totalSalaryCents: 10000,
        totalTipsCents: 2500,
        totalBonusCents: 1000,
        totalPenaltyCents: 400,
        totalAdjustmentsCents: 600,
        totalAccruedCents: 13100,
        shiftsCount: 1,
        adjustmentCount: 2,
      }),
    )

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "interval_1",
          itemType: "shift",
          grossPayCents: 10000,
          tipsCents: 2500,
          totalAccruedCents: 12500,
        }),
        expect.objectContaining({
          id: "adjustment_bonus",
          itemType: "adjustment",
          adjustmentType: "bonus",
          bonusCents: 1000,
          totalAccruedCents: 1000,
          adjustmentComment: "За инициативу",
        }),
        expect.objectContaining({
          id: "adjustment_penalty",
          itemType: "adjustment",
          adjustmentType: "penalty",
          penaltyCents: 400,
          totalAccruedCents: -400,
          adjustmentComment: "За опоздание",
        }),
      ]),
    )
  })

  it("keeps salary data available when adjustment storage is not migrated yet", async () => {
    mocked.prisma.workInterval.findMany.mockResolvedValue([
      {
        id: "interval_1",
        workdayId: "workday_1",
        workday: {
          id: "workday_1",
          workDate: new Date("2026-03-10T00:00:00.000Z"),
          locationId: "loc_1",
          status: "published",
        },
        employeeId: "employee_1",
        position: { name: "Бариста" },
        startAt: new Date("2026-03-10T09:00:00.000Z"),
        endAt: new Date("2026-03-10T17:00:00.000Z"),
        status: "completed",
        openedAt: new Date("2026-03-10T09:00:00.000Z"),
        closedAt: new Date("2026-03-10T17:00:00.000Z"),
        breakMinutes: 30,
        useCustomPay: false,
        revenueCents: null,
        calculatedMinutesWorked: 480,
        calculatedGrossPayCents: 10000,
        payCalculatedAt: new Date("2026-03-10T17:05:00.000Z"),
        createdAt: new Date("2026-03-10T08:00:00.000Z"),
        timeEntry: {
          clockInAt: new Date("2026-03-10T09:00:00.000Z"),
          clockOutAt: new Date("2026-03-10T17:00:00.000Z"),
        },
      },
    ])
    mocked.prisma.employeeEarningAdjustment.findMany.mockRejectedValue(
      new Error('The table `public.employee_earning_adjustment` does not exist'),
    )

    const result = await computeEmployeeEarnings({
      organizationId: "org_1",
      employeeId: "employee_1",
      organizationTimezone: "Europe/Prague",
      organizationCurrency: "CZK",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
    })

    expect(result.summary).toEqual(
      expect.objectContaining({
        totalSalaryCents: 10000,
        totalTipsCents: 2500,
        totalBonusCents: 0,
        totalPenaltyCents: 0,
        totalAdjustmentsCents: 0,
        totalAccruedCents: 12500,
        shiftsCount: 1,
        adjustmentCount: 0,
      }),
    )
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "interval_1",
        itemType: "shift",
        grossPayCents: 10000,
        tipsCents: 2500,
        totalAccruedCents: 12500,
      }),
    ])
    expect(console.warn).toHaveBeenCalledWith(
      "[payroll/earnings][adjustments-unavailable]",
      expect.any(Error),
    )
  })

  it("keeps salary data available when prisma client misses the adjustment delegate", async () => {
    mocked.prisma.workInterval.findMany.mockResolvedValue([
      {
        id: "interval_1",
        workdayId: "workday_1",
        workday: {
          id: "workday_1",
          workDate: new Date("2026-03-10T00:00:00.000Z"),
          locationId: "loc_1",
          status: "published",
        },
        employeeId: "employee_1",
        position: { name: "Бариста" },
        startAt: new Date("2026-03-10T09:00:00.000Z"),
        endAt: new Date("2026-03-10T17:00:00.000Z"),
        status: "completed",
        openedAt: new Date("2026-03-10T09:00:00.000Z"),
        closedAt: new Date("2026-03-10T17:00:00.000Z"),
        breakMinutes: 30,
        useCustomPay: false,
        revenueCents: null,
        calculatedMinutesWorked: 480,
        calculatedGrossPayCents: 10000,
        payCalculatedAt: new Date("2026-03-10T17:05:00.000Z"),
        createdAt: new Date("2026-03-10T08:00:00.000Z"),
        timeEntry: {
          clockInAt: new Date("2026-03-10T09:00:00.000Z"),
          clockOutAt: new Date("2026-03-10T17:00:00.000Z"),
        },
      },
    ])

    const previousDelegate = mocked.prisma.employeeEarningAdjustment
    ;(mocked.prisma as { employeeEarningAdjustment?: unknown }).employeeEarningAdjustment = undefined

    const result = await computeEmployeeEarnings({
      organizationId: "org_1",
      employeeId: "employee_1",
      organizationTimezone: "Europe/Prague",
      organizationCurrency: "CZK",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
    })

    expect(result.summary).toEqual(
      expect.objectContaining({
        totalSalaryCents: 10000,
        totalTipsCents: 2500,
        totalBonusCents: 0,
        totalPenaltyCents: 0,
        totalAdjustmentsCents: 0,
        totalAccruedCents: 12500,
        shiftsCount: 1,
        adjustmentCount: 0,
      }),
    )
    expect(console.warn).toHaveBeenCalledWith(
      "[payroll/earnings][adjustments-unavailable]",
      expect.any(Error),
    )

    ;(mocked.prisma as { employeeEarningAdjustment?: unknown }).employeeEarningAdjustment = previousDelegate
  })
})
