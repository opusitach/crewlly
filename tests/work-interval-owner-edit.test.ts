import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({
  syncWorkdayRevenueFromCashSessions: vi.fn(),
  syncWorkdayTipsFromCashSessions: vi.fn(),
  buildIntervalPaySnapshot: vi.fn(),
}))

vi.mock("@/lib/cash/revenue-allocation", () => ({
  syncWorkdayRevenueFromCashSessions: mocked.syncWorkdayRevenueFromCashSessions,
}))

vi.mock("@/lib/cash/tips-sync", () => ({
  syncWorkdayTipsFromCashSessions: mocked.syncWorkdayTipsFromCashSessions,
}))

vi.mock("@/lib/work-intervals/close", () => ({
  buildIntervalPaySnapshot: mocked.buildIntervalPaySnapshot,
}))

import { applyOwnerEditedWorkIntervalTime, WorkIntervalOwnerEditError } from "../lib/work-intervals/owner-edit"

describe("work interval owner edit helper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.syncWorkdayRevenueFromCashSessions.mockResolvedValue({
      totalRevenueCents: 10000,
      updatedIntervals: 2,
    })
    mocked.syncWorkdayTipsFromCashSessions.mockResolvedValue({
      frozen: false,
      totalAmountCents: 3000,
      splitMethod: "by_hours",
      allocationsCount: 2,
    })
    mocked.buildIntervalPaySnapshot.mockResolvedValue({
      minutesWorked: 455,
      grossPayCents: 9100,
    })
  })

  it("updates actual times, recalculates completed payroll and sends worker notification", async () => {
    const initialInterval = {
      id: "interval-1",
      employeeId: "employee-1",
      status: "completed",
      startAt: new Date("2026-03-19T10:00:00.000Z"),
      endAt: new Date("2026-03-19T19:00:00.000Z"),
      openedAt: new Date("2026-03-19T10:00:00.000Z"),
      closedAt: new Date("2026-03-19T19:00:00.000Z"),
      breakMinutes: 30,
      useCustomPay: false,
      revenueCents: 4000,
      conflictWithIntervalIds: [],
      timeEntry: {
        clockInAt: new Date("2026-03-19T10:00:00.000Z"),
        clockOutAt: new Date("2026-03-19T19:00:00.000Z"),
      },
      employee: {
        userId: "worker-user-1",
      },
      workday: {
        id: "workday-1",
        status: "draft",
        locationId: "location-1",
        organizationId: "org-1",
        workDate: new Date("2026-03-19T00:00:00.000Z"),
      },
    }

    const updatedInterval = {
      id: "interval-1",
      workdayId: "workday-1",
      employeeId: "employee-1",
      positionId: "position-1",
      startAt: new Date("2026-03-19T10:00:00.000Z"),
      endAt: new Date("2026-03-19T19:00:00.000Z"),
      status: "completed",
      openedAt: new Date("2026-03-19T10:15:00.000Z"),
      closedAt: new Date("2026-03-19T18:20:00.000Z"),
      breakMinutes: 30,
      revenueCents: 5000,
      calculatedMinutesWorked: 455,
      calculatedGrossPayCents: 9100,
      payCalculatedAt: new Date("2026-03-19T18:21:00.000Z"),
      timeEntry: {
        id: "time-entry-1",
        clockInAt: new Date("2026-03-19T10:15:00.000Z"),
        clockOutAt: new Date("2026-03-19T18:20:00.000Z"),
        clockInPhotoUrl: null,
        clockOutPhotoUrl: null,
      },
      workday: {
        id: "workday-1",
        workDate: new Date("2026-03-19T00:00:00.000Z"),
        status: "draft",
      },
      employee: {
        id: "employee-1",
        user: {
          fullName: "kol",
          avatarUrl: null,
        },
      },
      position: {
        id: "position-1",
        name: "Бариста",
      },
    }

    const tx = {
      workInterval: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(initialInterval)
          .mockResolvedValueOnce(updatedInterval),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "interval-1",
            status: "completed",
            conflictWithIntervalIds: [],
            openedAt: new Date("2026-03-19T10:15:00.000Z"),
            closedAt: new Date("2026-03-19T18:20:00.000Z"),
            timeEntry: {
              clockInAt: new Date("2026-03-19T10:15:00.000Z"),
              clockOutAt: new Date("2026-03-19T18:20:00.000Z"),
            },
          },
          {
            id: "interval-2",
            status: "in_progress",
            conflictWithIntervalIds: [],
            openedAt: new Date("2026-03-19T09:00:00.000Z"),
            closedAt: null,
            timeEntry: {
              clockInAt: new Date("2026-03-19T09:00:00.000Z"),
              clockOutAt: null,
            },
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      timeEntry: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      notification: {
        create: vi.fn().mockResolvedValue({}),
      },
    }

    const result = await applyOwnerEditedWorkIntervalTime(tx as any, {
      intervalId: "interval-1",
      ownerUserId: "owner-user-1",
      openedAt: new Date("2026-03-19T10:15:00.000Z"),
      closedAt: new Date("2026-03-19T18:20:00.000Z"),
      reason: "Исправили фактическое время",
      employeeNotification: {
        organizationId: "org-1",
        userId: "worker-user-1",
        title: "Изменены фактические часы смены",
        message: "Владелец изменил фактическое время смены",
        payload: {
          view: "worker_planner",
          intervalId: "interval-1",
          workDate: "2026-03-19",
          openWeekView: true,
        },
      },
    })

    expect(tx.timeEntry.upsert).toHaveBeenCalledWith({
      where: { workIntervalId: "interval-1" },
      create: {
        workIntervalId: "interval-1",
        employeeId: "employee-1",
        clockInAt: new Date("2026-03-19T10:15:00.000Z"),
        clockOutAt: new Date("2026-03-19T18:20:00.000Z"),
      },
      update: {
        clockInAt: new Date("2026-03-19T10:15:00.000Z"),
        clockOutAt: new Date("2026-03-19T18:20:00.000Z"),
      },
    })
    expect(tx.workInterval.update).toHaveBeenCalledWith({
      where: { id: "interval-1" },
      data: expect.objectContaining({
        openedAt: new Date("2026-03-19T10:15:00.000Z"),
        closedAt: new Date("2026-03-19T18:20:00.000Z"),
        calculatedMinutesWorked: null,
        calculatedGrossPayCents: null,
        payCalculatedAt: null,
      }),
    })
    expect(mocked.syncWorkdayRevenueFromCashSessions).toHaveBeenCalledWith(tx, "workday-1")
    expect(mocked.syncWorkdayTipsFromCashSessions).toHaveBeenCalledWith(tx, {
      workdayId: "workday-1",
      locationId: "location-1",
    })
    expect(mocked.buildIntervalPaySnapshot).toHaveBeenCalledTimes(1)
    expect(mocked.buildIntervalPaySnapshot).toHaveBeenCalledWith(tx, "interval-1")
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        userId: "worker-user-1",
        type: "shift",
        title: "Изменены фактические часы смены",
      }),
    })
    expect(result.recalculatedIntervals).toBe(1)
    expect(result.interval.calculatedMinutesWorked).toBe(455)
    expect(result.interval.calculatedGrossPayCents).toBe(9100)
  })

  it("rejects owner edit when shift is already reviewed", async () => {
    const tx = {
      workInterval: {
        findUnique: vi.fn().mockResolvedValue({
          id: "interval-1",
          employeeId: "employee-1",
          status: "completed",
          startAt: new Date("2026-03-19T10:00:00.000Z"),
          endAt: new Date("2026-03-19T19:00:00.000Z"),
          openedAt: new Date("2026-03-19T10:00:00.000Z"),
          closedAt: new Date("2026-03-19T19:00:00.000Z"),
          breakMinutes: 30,
          useCustomPay: false,
          revenueCents: 4000,
          conflictWithIntervalIds: [],
          timeEntry: null,
          employee: {
            userId: "worker-user-1",
          },
          workday: {
            id: "workday-1",
            status: "published",
            locationId: "location-1",
            organizationId: "org-1",
            workDate: new Date("2026-03-19T00:00:00.000Z"),
          },
        }),
      },
    }

    await expect(
      applyOwnerEditedWorkIntervalTime(tx as any, {
        intervalId: "interval-1",
        ownerUserId: "owner-user-1",
        openedAt: new Date("2026-03-19T10:15:00.000Z"),
        closedAt: new Date("2026-03-19T18:20:00.000Z"),
        reason: "Исправили фактическое время",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "INTERVAL_ALREADY_REVIEWED",
    })
  })
})
