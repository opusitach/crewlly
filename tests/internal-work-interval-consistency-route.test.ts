import { describe, expect, it, beforeEach, vi } from "vitest"

const mocked = vi.hoisted(() => ({
  prisma: {
    workInterval: {
      findMany: vi.fn(),
    },
  },
  isAuthorizedInternalCronRequest: vi.fn(),
  logAuditEvent: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/internal-cron", () => ({
  isAuthorizedInternalCronRequest: mocked.isAuthorizedInternalCronRequest,
}))

vi.mock("@/lib/observability/audit", () => ({
  logAuditEvent: mocked.logAuditEvent,
}))

import { POST } from "../app/api/internal/work-intervals/consistency-check/route"

describe("POST /api/internal/work-intervals/consistency-check", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects unauthorized requests", async () => {
    mocked.isAuthorizedInternalCronRequest.mockReturnValue(false)

    const response = await POST(new Request("http://localhost/api/internal/work-intervals/consistency-check", { method: "POST" }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: "Unauthorized" })
    expect(mocked.logAuditEvent).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        event_type: "cron.work_interval_consistency.run",
        outcome: "denied",
        status: 401,
      }),
    )
  })

  it("reports success when no drift is found", async () => {
    mocked.isAuthorizedInternalCronRequest.mockReturnValue(true)
    mocked.prisma.workInterval.findMany.mockResolvedValue([])

    const response = await POST(new Request("http://localhost/api/internal/work-intervals/consistency-check", { method: "POST" }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        driftCount: 0,
        truncated: false,
        nextAction: "idle",
      }),
    )
    expect(mocked.logAuditEvent).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        event_type: "cron.work_interval_consistency.run",
        outcome: "success",
        status: 200,
        route: "/api/internal/work-intervals/consistency-check",
      }),
    )
  })

  it("reports failure when drift is detected", async () => {
    mocked.isAuthorizedInternalCronRequest.mockReturnValue(true)
    mocked.prisma.workInterval.findMany.mockResolvedValue([
      {
        id: "interval-1",
        employeeId: "employee-1",
        workdayId: "workday-1",
        status: "scheduled",
        startAt: new Date("2026-03-04T08:00:00.000Z"),
        endAt: new Date("2026-03-04T16:00:00.000Z"),
        openedAt: null,
        closedAt: null,
        updatedAt: new Date("2026-03-05T10:00:00.000Z"),
        conflictWithIntervalIds: [],
        timeEntry: {
          clockInAt: new Date("2026-03-04T08:05:00.000Z"),
          clockOutAt: null,
        },
      },
    ])

    const response = await POST(new Request("http://localhost/api/internal/work-intervals/consistency-check", { method: "POST" }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(
      expect.objectContaining({
        ok: false,
        driftCount: 1,
        nextAction: "investigate",
        driftCountsByCode: expect.objectContaining({
          status_effective_mismatch: 1,
          opened_at_missing_for_clock_in: 1,
        }),
      }),
    )
    expect(body.sampledIntervals).toEqual([
      expect.objectContaining({
        intervalId: "interval-1",
        rawStatus: "scheduled",
        effectiveStatus: "in_progress",
      }),
    ])
    expect(mocked.logAuditEvent).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        event_type: "cron.work_interval_consistency.run",
        outcome: "failure",
        status: 200,
        reason: "drift_detected",
      }),
    )
  })
})
