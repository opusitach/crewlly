import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    notification: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

import { PATCH, DELETE } from "../app/api/notifications/[id]/route"

describe("PATCH /api/notifications/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSessionUserWithOrg.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1" },
    })
  })

  it("marks notification as read for current user", async () => {
    mocked.prisma.notification.findFirst.mockResolvedValue({ id: "notif_1" })
    mocked.prisma.notification.update.mockResolvedValue({
      id: "notif_1",
      status: "read",
      readAt: new Date("2026-02-19T18:00:00.000Z"),
    })

    const response = await PATCH(
      new Request("http://localhost/api/notifications/notif_1", { method: "PATCH" }),
      { params: Promise.resolve({ id: "notif_1" }) },
    )
    const body = (await response.json()) as {
      data?: { id: string; status: string; readAt: string | null }
    }

    expect(response.status).toBe(200)
    expect(mocked.prisma.notification.findFirst).toHaveBeenCalledWith({
      where: {
        id: "notif_1",
        userId: "user_1",
        organizationId: "org_1",
      },
    })
    expect(mocked.prisma.notification.update).toHaveBeenCalledWith({
      where: { id: "notif_1" },
      data: { status: "read", readAt: expect.any(Date) },
    })
    expect(body.data).toEqual({
      id: "notif_1",
      status: "read",
      readAt: "2026-02-19T18:00:00.000Z",
    })
  })
})

describe("DELETE /api/notifications/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSessionUserWithOrg.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1" },
    })
  })

  it("deletes notification of current user", async () => {
    mocked.prisma.notification.findFirst.mockResolvedValue({ id: "notif_2" })
    mocked.prisma.notification.delete.mockResolvedValue({ id: "notif_2" })

    const response = await DELETE(
      new Request("http://localhost/api/notifications/notif_2", { method: "DELETE" }),
      { params: Promise.resolve({ id: "notif_2" }) },
    )
    const body = (await response.json()) as { success?: boolean }

    expect(response.status).toBe(200)
    expect(mocked.prisma.notification.findFirst).toHaveBeenCalledWith({
      where: {
        id: "notif_2",
        userId: "user_1",
        organizationId: "org_1",
      },
    })
    expect(mocked.prisma.notification.delete).toHaveBeenCalledWith({ where: { id: "notif_2" } })
    expect(body.success).toBe(true)
  })
})
