import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    notification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  }

  return {
    prisma,
    getSessionUserWithOrg: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUserWithOrg: mocked.getSessionUserWithOrg,
}))

import { GET } from "../app/api/notifications/route"

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("filters notifications by status, types and limit", async () => {
    mocked.getSessionUserWithOrg.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1" },
    })

    mocked.prisma.notification.findMany.mockResolvedValue([
      {
        id: "n_1",
        type: "shift",
        title: "Открыта рабочая смена",
        message: "Сотрудник открыл смену",
        payload: {
          view: "owner_shifts",
          intervalId: "interval_1",
          workDate: "2026-02-18",
        },
        status: "unread",
        createdAt: new Date("2026-02-18T10:00:00Z"),
        readAt: null,
      },
    ])

    const response = await GET(
      new Request("http://localhost/api/notifications?status=unread&types=shift,cash&limit=5"),
    )
    const body = (await response.json()) as {
      data?: Array<{ id: string; type: string; status: string }>
    }

    expect(response.status).toBe(200)
    expect(mocked.prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        organizationId: "org_1",
        status: "unread",
        type: { in: ["shift", "cash"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    expect(body.data).toEqual([
      {
        id: "n_1",
        type: "shift",
        title: "Открыта рабочая смена",
        message: "Сотрудник открыл смену",
        payload: {
          view: "owner_shifts",
          intervalId: "interval_1",
          workDate: "2026-02-18",
        },
        status: "unread",
        createdAt: "2026-02-18T10:00:00.000Z",
        readAt: null,
      },
    ])
  })
})
