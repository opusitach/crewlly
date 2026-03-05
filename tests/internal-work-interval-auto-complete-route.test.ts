import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({
  prisma: {
    workInterval: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  isAuthorizedInternalCronRequest: vi.fn(),
  finalizeWorkIntervalClose: vi.fn(),
  isProceduresSchemaMissing: vi.fn(),
  toEventActorName: vi.fn(),
  toEventDateLabel: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/internal-cron", () => ({
  isAuthorizedInternalCronRequest: mocked.isAuthorizedInternalCronRequest,
}))

vi.mock("@/lib/notifications/owner-events", () => ({
  toEventActorName: mocked.toEventActorName,
  toEventDateLabel: mocked.toEventDateLabel,
}))

vi.mock("@/lib/work-intervals/close", () => ({
  AUTO_CLOSE_AFTER_HOURS: 24,
  AUTO_CLOSE_REASON: "auto-close-reason",
  finalizeWorkIntervalClose: mocked.finalizeWorkIntervalClose,
  isProceduresSchemaMissing: mocked.isProceduresSchemaMissing,
  resolveWorkIntervalAutoCloseAt: ({
    startAt,
    openedAt,
    timeEntry,
  }: {
    startAt: Date
    openedAt?: Date | null
    timeEntry?: { clockInAt?: Date | null } | null
  }) => new Date((openedAt ?? timeEntry?.clockInAt ?? startAt).getTime() + 24 * 60 * 60 * 1000),
}))

import { POST } from "../app/api/internal/work-intervals/auto-complete/route"

describe("POST /api/internal/work-intervals/auto-complete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-05T12:00:00.000Z"))

    mocked.isAuthorizedInternalCronRequest.mockReturnValue(true)
    mocked.toEventActorName.mockImplementation((input: { fullName?: string | null }, fallback: string) => input.fullName ?? fallback)
    mocked.toEventDateLabel.mockReturnValue("05.03.2026")
    mocked.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({}))
    mocked.isProceduresSchemaMissing.mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("closes only intervals that already passed the 24-hour deadline", async () => {
    mocked.prisma.workInterval.findMany.mockResolvedValue([
      {
        id: "interval-stale",
        startAt: new Date("2026-03-04T08:00:00.000Z"),
        openedAt: new Date("2026-03-04T10:00:00.000Z"),
        timeEntry: null,
        employee: { user: { fullName: "Иван Петров", email: "ivan@example.com" } },
        workday: {
          id: "workday-1",
          organizationId: "org-1",
          locationId: "location-1",
          workDate: new Date("2026-03-05T00:00:00.000Z"),
        },
      },
      {
        id: "interval-fresh",
        startAt: new Date("2026-03-04T08:00:00.000Z"),
        openedAt: new Date("2026-03-04T14:30:00.000Z"),
        timeEntry: null,
        employee: { user: { fullName: "Мария Иванова", email: "maria@example.com" } },
        workday: {
          id: "workday-2",
          organizationId: "org-1",
          locationId: "location-2",
          workDate: new Date("2026-03-05T00:00:00.000Z"),
        },
      },
    ])

    mocked.finalizeWorkIntervalClose.mockResolvedValue({
      interval: { id: "interval-stale" },
      snapshot: null,
      closedAt: new Date("2026-03-05T10:00:00.000Z"),
    })

    const response = await POST(new Request("http://localhost/api/internal/work-intervals/auto-complete", { method: "POST" }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocked.finalizeWorkIntervalClose).toHaveBeenCalledTimes(1)
    expect(mocked.finalizeWorkIntervalClose).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        intervalId: "interval-stale",
        closedAt: new Date("2026-03-05T10:00:00.000Z"),
        closeOverrideReason: "auto-close-reason",
      }),
    )
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        matched: 1,
        closed: 1,
        failed: 0,
      }),
    )
  })

  it("retries without workday sync when procedures schema is missing", async () => {
    mocked.prisma.workInterval.findMany.mockResolvedValue([
      {
        id: "interval-stale",
        startAt: new Date("2026-03-04T08:00:00.000Z"),
        openedAt: new Date("2026-03-04T09:00:00.000Z"),
        timeEntry: null,
        employee: { user: { fullName: "Иван Петров", email: "ivan@example.com" } },
        workday: {
          id: "workday-1",
          organizationId: "org-1",
          locationId: "location-1",
          workDate: new Date("2026-03-05T00:00:00.000Z"),
        },
      },
    ])

    mocked.finalizeWorkIntervalClose
      .mockRejectedValueOnce(new Error("procedures missing"))
      .mockResolvedValueOnce({
        interval: { id: "interval-stale" },
        snapshot: null,
        closedAt: new Date("2026-03-05T09:00:00.000Z"),
      })
    mocked.isProceduresSchemaMissing.mockReturnValue(true)

    const response = await POST(new Request("http://localhost/api/internal/work-intervals/auto-complete", { method: "POST" }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocked.finalizeWorkIntervalClose).toHaveBeenCalledTimes(2)
    expect(mocked.finalizeWorkIntervalClose.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        intervalId: "interval-stale",
        syncWorkday: false,
      }),
    )
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        warnings: 1,
        closed: 1,
        failed: 0,
      }),
    )
  })
})
