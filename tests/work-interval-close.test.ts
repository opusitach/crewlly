import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({
  syncCashSessionFromWorkdayProcedures: vi.fn(),
  syncWorkdayRevenueFromCashSessions: vi.fn(),
  syncWorkdayTipsFromCashSessions: vi.fn(),
  notifyOrganizationOwners: vi.fn(),
}))

vi.mock("@/lib/cash/session-sync", () => ({
  syncCashSessionFromWorkdayProcedures: mocked.syncCashSessionFromWorkdayProcedures,
}))

vi.mock("@/lib/cash/revenue-allocation", () => ({
  syncWorkdayRevenueFromCashSessions: mocked.syncWorkdayRevenueFromCashSessions,
}))

vi.mock("@/lib/cash/tips-sync", () => ({
  syncWorkdayTipsFromCashSessions: mocked.syncWorkdayTipsFromCashSessions,
}))

vi.mock("@/lib/notifications/owner-events", () => ({
  notifyOrganizationOwners: mocked.notifyOrganizationOwners,
}))

import { finalizeWorkIntervalClose, resolveWorkIntervalAutoCloseAt } from "../lib/work-intervals/close"

describe("work interval close helper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resolves auto-close deadline from openedAt first", () => {
    const result = resolveWorkIntervalAutoCloseAt({
      startAt: new Date("2026-03-04T08:00:00.000Z"),
      openedAt: new Date("2026-03-04T09:15:00.000Z"),
      timeEntry: {
        clockInAt: new Date("2026-03-04T09:30:00.000Z"),
      },
    })

    expect(result.toISOString()).toBe("2026-03-05T09:15:00.000Z")
  })

  it("finalizes interval, backfills clock-out, recalculates payroll and syncs workday", async () => {
    const closedAt = new Date("2026-03-04T16:00:00.000Z")

    const tx = {
      timeEntry: {
        findUnique: vi.fn().mockResolvedValue({
          clockInAt: new Date("2026-03-04T08:00:00.000Z"),
          clockOutAt: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      workInterval: {
        findUnique: vi.fn().mockResolvedValue({
          id: "interval-1",
          employeeId: "employee-1",
          status: "in_progress",
          startAt: new Date("2026-03-04T08:00:00.000Z"),
          endAt: new Date("2026-03-04T16:00:00.000Z"),
          openedAt: null,
          closedAt: null,
          breakMinutes: 30,
          useCustomPay: false,
          revenueCents: 15000,
          timeEntry: {
            clockInAt: new Date("2026-03-04T08:00:00.000Z"),
            clockOutAt: closedAt,
          },
        }),
        update: vi.fn().mockResolvedValue({
          id: "interval-1",
          status: "completed",
          closedAt,
        }),
      },
      workIntervalPayComponent: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      employeePayComponent: {
        findMany: vi.fn().mockResolvedValue([
          {
            componentType: "hourly",
            amountCents: 1000,
            rateBp: null,
            isActive: true,
          },
        ]),
      },
    }

    const result = await finalizeWorkIntervalClose(tx as any, {
      intervalId: "interval-1",
      workdayId: "workday-1",
      locationId: "location-1",
      closedAt,
      closeOverrideReason: "auto-close",
      notification: {
        organizationId: "org-1",
        title: "Смена автоматически завершена",
        message: "Autoclose message",
      },
    })

    expect(tx.timeEntry.update).toHaveBeenCalledWith({
      where: { workIntervalId: "interval-1" },
      data: { clockOutAt: closedAt },
    })
    expect(tx.workInterval.update).toHaveBeenCalledWith({
      where: { id: "interval-1" },
      data: expect.objectContaining({
        status: "completed",
        closedAt,
        closeOverrideReason: "auto-close",
        calculatedMinutesWorked: 450,
        calculatedGrossPayCents: 7500,
      }),
    })
    expect(mocked.syncCashSessionFromWorkdayProcedures).toHaveBeenCalledWith(tx, {
      workdayId: "workday-1",
      locationId: "location-1",
    })
    expect(mocked.syncWorkdayRevenueFromCashSessions).toHaveBeenCalledWith(tx, "workday-1")
    expect(mocked.syncWorkdayTipsFromCashSessions).toHaveBeenCalledWith(tx, {
      workdayId: "workday-1",
      locationId: "location-1",
    })
    expect(mocked.notifyOrganizationOwners).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: "org-1",
        title: "Смена автоматически завершена",
      }),
    )
    expect(result.snapshot?.minutesWorked).toBe(450)
    expect(result.snapshot?.grossPayCents).toBe(7500)
  })
})
