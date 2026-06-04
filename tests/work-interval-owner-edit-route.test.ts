import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
  }

  return {
    prisma,
    getAuthorizedInterval: vi.fn(),
    applyOwnerEditedWorkIntervalTime: vi.fn(),
    auditActorFromSession: vi.fn(),
    logAuditEvent: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/procedures/access", () => ({
  getAuthorizedInterval: mocked.getAuthorizedInterval,
}))

vi.mock("@/lib/work-intervals/owner-edit", async () => {
  const actual = await vi.importActual("@/lib/work-intervals/owner-edit")
  return {
    ...actual,
    applyOwnerEditedWorkIntervalTime: mocked.applyOwnerEditedWorkIntervalTime,
  }
})

vi.mock("@/lib/observability/audit", () => ({
  auditActorFromSession: mocked.auditActorFromSession,
  logAuditEvent: mocked.logAuditEvent,
}))

import { WorkIntervalOwnerEditError } from "../lib/work-intervals/owner-edit"
import { PATCH } from "../app/api/work-intervals/[id]/owner-edit/route"

describe("PATCH /api/work-intervals/[id]/owner-edit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.auditActorFromSession.mockReturnValue({ user_id: "owner-user-1" })
    mocked.getAuthorizedInterval.mockResolvedValue({
      access: {
        user: { id: "owner-user-1", primaryMode: null },
        organizationId: "org-1",
        organization: { id: "org-1", timezone: "Europe/Prague" },
        membership: null,
        effectiveRoleKey: "owner",
      },
      interval: {
        id: "interval-1",
        employeeId: "employee-1",
        openedAt: new Date("2026-03-19T10:00:00.000Z"),
        closedAt: new Date("2026-03-19T19:00:00.000Z"),
        workday: {
          id: "workday-1",
          organizationId: "org-1",
          workDate: new Date("2026-03-19T00:00:00.000Z"),
        },
      },
      isOwner: true,
      effectiveStatus: "completed",
      effectiveOpenedAt: new Date("2026-03-19T10:00:00.000Z"),
      effectiveClosedAt: new Date("2026-03-19T19:00:00.000Z"),
      error: null,
      status: 200,
    })
    mocked.applyOwnerEditedWorkIntervalTime.mockResolvedValue({
      interval: {
        id: "interval-1",
        workdayId: "workday-1",
        openedAt: new Date("2026-03-19T21:10:00.000Z"),
        closedAt: new Date("2026-03-20T05:05:00.000Z"),
        calculatedMinutesWorked: 475,
        calculatedGrossPayCents: 9800,
        payCalculatedAt: new Date("2026-03-20T05:06:00.000Z"),
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
        timeEntry: {
          id: "time-entry-1",
          clockInAt: new Date("2026-03-19T21:10:00.000Z"),
          clockOutAt: new Date("2026-03-20T05:05:00.000Z"),
          clockInPhotoUrl: null,
          clockOutPhotoUrl: null,
        },
      },
      revenueSync: {
        totalRevenueCents: 10000,
        updatedIntervals: 2,
      },
      tipsSync: {
        frozen: false,
        totalAmountCents: 3000,
        splitMethod: "by_hours",
        allocationsCount: 2,
      },
      recalculatedIntervals: 2,
      reason: "Исправили фактическое время",
    })
    mocked.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        employee: {
          findUnique: vi.fn().mockResolvedValue({ userId: "worker-user-1" }),
        },
      }),
    )
  })

  it("rejects request for non-owner users", async () => {
    mocked.getAuthorizedInterval.mockResolvedValueOnce({
      access: {
        user: { id: "manager-user-1", primaryMode: null },
        organizationId: "org-1",
        organization: { id: "org-1", timezone: "Europe/Prague" },
        membership: null,
        effectiveRoleKey: "manager",
      },
      interval: {
        id: "interval-1",
        employeeId: "employee-1",
        workday: {
          id: "workday-1",
          organizationId: "org-1",
          workDate: new Date("2026-03-19T00:00:00.000Z"),
        },
      },
      isOwner: false,
      effectiveStatus: "completed",
      error: null,
      status: 200,
    })

    const response = await PATCH(
      new Request("http://localhost/api/work-intervals/interval-1/owner-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openedTime: "10:00",
          closedTime: "19:00",
          reason: "Исправили время",
        }),
      }),
      { params: Promise.resolve({ id: "interval-1" }) },
    )

    const body = (await response.json()) as { error?: string }

    expect(response.status).toBe(403)
    expect(body.error).toBe("Только владелец может изменять фактическое время смены")
    expect(mocked.applyOwnerEditedWorkIntervalTime).not.toHaveBeenCalled()
  })

  it("parses overnight time range and passes next-day closedAt to helper", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/work-intervals/interval-1/owner-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openedTime: "22:10",
          closedTime: "06:05",
          reason: "Исправили ночную смену",
        }),
      }),
      { params: Promise.resolve({ id: "interval-1" }) },
    )

    const body = (await response.json()) as { data?: { openedAt: string; closedAt: string } }
    const helperInput = mocked.applyOwnerEditedWorkIntervalTime.mock.calls[0]?.[1]

    expect(response.status).toBe(200)
    expect(helperInput).toEqual(
      expect.objectContaining({
        intervalId: "interval-1",
        ownerUserId: "owner-user-1",
        reason: "Исправили ночную смену",
      }),
    )
    expect(helperInput.openedAt.toISOString()).toBe("2026-03-19T21:10:00.000Z")
    expect(helperInput.closedAt.toISOString()).toBe("2026-03-20T05:05:00.000Z")
    expect(helperInput.closedAt.getTime()).toBeGreaterThan(helperInput.openedAt.getTime())
    expect(body.data?.openedAt).toBe("2026-03-19T21:10:00.000Z")
    expect(body.data?.closedAt).toBe("2026-03-20T05:05:00.000Z")
  })

  it("prefers exact ISO timestamps from the client when they are provided", async () => {
    await PATCH(
      new Request("http://localhost/api/work-intervals/interval-1/owner-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openedTime: "22:10",
          closedTime: "06:05",
          openedAt: "2026-03-19T21:10:00.000Z",
          closedAt: "2026-03-20T05:05:00.000Z",
          reason: "Исправили время по локальному часовому поясу",
        }),
      }),
      { params: Promise.resolve({ id: "interval-1" }) },
    )

    const helperInput = mocked.applyOwnerEditedWorkIntervalTime.mock.calls.at(-1)?.[1]

    expect(helperInput.openedAt.toISOString()).toBe("2026-03-19T21:10:00.000Z")
    expect(helperInput.closedAt.toISOString()).toBe("2026-03-20T05:05:00.000Z")
  })

  it("returns helper domain errors as route response", async () => {
    mocked.applyOwnerEditedWorkIntervalTime.mockRejectedValueOnce(
      new WorkIntervalOwnerEditError("Изменение времени недоступно для уже проверенной смены", {
        status: 409,
        code: "INTERVAL_ALREADY_REVIEWED",
      }),
    )

    const response = await PATCH(
      new Request("http://localhost/api/work-intervals/interval-1/owner-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openedTime: "10:00",
          closedTime: "19:00",
          reason: "Исправили время",
        }),
      }),
      { params: Promise.resolve({ id: "interval-1" }) },
    )

    const body = (await response.json()) as { error?: string; code?: string }

    expect(response.status).toBe(409)
    expect(body.code).toBe("INTERVAL_ALREADY_REVIEWED")
    expect(body.error).toBe("Изменение времени недоступно для уже проверенной смены")
  })
})
