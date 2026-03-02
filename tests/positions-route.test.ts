import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    position: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  }

  return {
    prisma,
    getSessionUserWithOrg: vi.fn(),
    isOwnerOrManagerRole: vi.fn(),
    getDefaultRuleSetupByPosition: vi.fn(),
    isDefaultRulesetConfigured: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUserWithOrg: mocked.getSessionUserWithOrg,
  isOwnerOrManagerRole: mocked.isOwnerOrManagerRole,
}))

vi.mock("@/lib/procedures/config", () => ({
  getDefaultRuleSetupByPosition: mocked.getDefaultRuleSetupByPosition,
  isDefaultRulesetConfigured: mocked.isDefaultRulesetConfigured,
}))

import { POST as POST_POSITION } from "../app/api/positions/route"

describe("positions route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSessionUserWithOrg.mockResolvedValue({
      organization: { id: "org_1" },
      membership: { role: "owner" },
    })
    mocked.isOwnerOrManagerRole.mockReturnValue(true)
  })

  it("creates a role in current organization when organizationId is omitted", async () => {
    mocked.prisma.position.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sortOrder: 2 })
    mocked.prisma.position.create.mockResolvedValue({
      id: "pos_new",
      organizationId: "org_1",
      name: "Бариста",
      isActive: true,
      sortOrder: 3,
    })

    const response = await POST_POSITION(
      new Request("http://localhost/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "  Бариста  " }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocked.prisma.position.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        locationId: null,
        name: "Бариста",
        sortOrder: 3,
      },
    })
    expect(body.data.id).toBe("pos_new")
  })

  it("reactivates an archived role with the same name", async () => {
    mocked.prisma.position.findFirst
      .mockResolvedValueOnce({
        id: "pos_old",
        organizationId: "org_1",
        name: "Бариста",
        isActive: false,
      })
      .mockResolvedValueOnce({ sortOrder: 4 })
    mocked.prisma.position.update.mockResolvedValue({
      id: "pos_old",
      organizationId: "org_1",
      name: "Бариста",
      isActive: true,
      sortOrder: 5,
    })

    const response = await POST_POSITION(
      new Request("http://localhost/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Бариста" }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocked.prisma.position.update).toHaveBeenCalledWith({
      where: { id: "pos_old" },
      data: {
        name: "Бариста",
        locationId: null,
        sortOrder: 5,
        isActive: true,
      },
    })
    expect(mocked.prisma.position.create).not.toHaveBeenCalled()
    expect(body.meta).toEqual({ reactivated: true })
  })

  it("rejects duplicate active role", async () => {
    mocked.prisma.position.findFirst.mockResolvedValueOnce({
      id: "pos_existing",
      organizationId: "org_1",
      name: "Бариста",
      isActive: true,
    })
    mocked.prisma.position.findFirst.mockResolvedValueOnce({ sortOrder: 1 })

    const response = await POST_POSITION(
      new Request("http://localhost/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Бариста" }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe("Должность с таким названием уже существует")
    expect(mocked.prisma.position.create).not.toHaveBeenCalled()
    expect(mocked.prisma.position.update).not.toHaveBeenCalled()
  })
})
