import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    workInterval: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    workIntervalPayComponent: {
      findMany: vi.fn(),
    },
    employeePayComponent: {
      findMany: vi.fn(),
    },
  }

  return {
    prisma,
    getSessionUserWithOrg: vi.fn(),
    getUserEmployee: vi.fn(),
    computeIntervalCompensation: vi.fn(),
    computeIntervalMinutesWorked: vi.fn(),
    resolveIntervalPayComponents: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUserWithOrg: mocked.getSessionUserWithOrg,
  getUserEmployee: mocked.getUserEmployee,
}))

vi.mock("@/lib/payroll/interval-compensation", () => ({
  computeIntervalCompensation: mocked.computeIntervalCompensation,
  computeIntervalMinutesWorked: mocked.computeIntervalMinutesWorked,
  resolveIntervalPayComponents: mocked.resolveIntervalPayComponents,
}))

import { GET } from "../app/api/worker/next-shift/route"

const makeInterval = (input: {
  id: string
  status: string
  startAt: string
  endAt: string
  openedAt?: string | null
  closedAt?: string | null
  timeEntry?: { clockInAt?: string | null; clockOutAt?: string | null } | null
}) => ({
  id: input.id,
  status: input.status,
  startAt: new Date(input.startAt),
  endAt: new Date(input.endAt),
  openedAt: input.openedAt ? new Date(input.openedAt) : null,
  closedAt: input.closedAt ? new Date(input.closedAt) : null,
  position: { name: "Официант" },
  useCustomPay: false,
  breakMinutes: 0,
  revenueCents: null,
  timeEntry: input.timeEntry
    ? {
        clockInAt: input.timeEntry.clockInAt ? new Date(input.timeEntry.clockInAt) : null,
        clockOutAt: input.timeEntry.clockOutAt ? new Date(input.timeEntry.clockOutAt) : null,
      }
    : null,
})

describe("GET /api/worker/next-shift", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSessionUserWithOrg.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", currency: "CZK" },
    })
    mocked.getUserEmployee.mockResolvedValue({ id: "employee_1" })
    mocked.prisma.workIntervalPayComponent.findMany.mockResolvedValue([])
    mocked.prisma.employeePayComponent.findMany.mockResolvedValue([])
    mocked.resolveIntervalPayComponents.mockReturnValue([])
    mocked.computeIntervalMinutesWorked.mockReturnValue({ minutesWorked: 60 })
    mocked.computeIntervalCompensation.mockReturnValue({ grossPayCents: 10000 })
  })

  it("returns in_progress interval first when it exists", async () => {
    mocked.prisma.workInterval.findMany.mockResolvedValueOnce([
      makeInterval({
        id: "in-progress",
        status: "in_progress",
        startAt: "2026-03-01T08:00:00.000Z",
        endAt: "2026-03-01T20:00:00.000Z",
      }),
    ])
    mocked.prisma.workInterval.findFirst
      .mockResolvedValueOnce(
        makeInterval({
          id: "overdue",
          status: "scheduled",
          startAt: "2026-03-01T09:00:00.000Z",
          endAt: "2026-03-01T21:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        makeInterval({
          id: "upcoming",
          status: "scheduled",
          startAt: "2026-03-02T09:00:00.000Z",
          endAt: "2026-03-02T18:00:00.000Z",
        }),
      )

    const response = await GET()
    const body = (await response.json()) as { data: { id: string } | null }

    expect(response.status).toBe(200)
    expect(body.data?.id).toBe("in-progress")
  })

  it("falls back to overdue scheduled interval before upcoming", async () => {
    mocked.prisma.workInterval.findMany.mockResolvedValueOnce([])
    mocked.prisma.workInterval.findFirst
      .mockResolvedValueOnce(
        makeInterval({
          id: "overdue",
          status: "scheduled",
          startAt: "2026-03-01T09:00:00.000Z",
          endAt: "2026-03-01T21:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        makeInterval({
          id: "upcoming",
          status: "scheduled",
          startAt: "2026-03-02T09:00:00.000Z",
          endAt: "2026-03-02T18:00:00.000Z",
        }),
      )

    const response = await GET()
    const body = (await response.json()) as { data: { id: string } | null }

    expect(response.status).toBe(200)
    expect(body.data?.id).toBe("overdue")
  })

  it("treats a scheduled interval with open clock-in as in_progress", async () => {
    mocked.prisma.workInterval.findMany.mockResolvedValueOnce([
      makeInterval({
        id: "desynced-open",
        status: "scheduled",
        startAt: "2026-03-01T08:00:00.000Z",
        endAt: "2026-03-01T20:00:00.000Z",
        timeEntry: {
          clockInAt: "2026-03-01T08:05:00.000Z",
          clockOutAt: null,
        },
      }),
    ])
    mocked.prisma.workInterval.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    const response = await GET()
    const body = (await response.json()) as { data: { id: string; status: string } | null }

    expect(response.status).toBe(200)
    expect(body.data).toEqual(
      expect.objectContaining({
        id: "desynced-open",
        status: "in_progress",
      }),
    )
  })
})
