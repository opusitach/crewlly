import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    organizationMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    prisma,
    getSessionUser: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUser: mocked.getSessionUser,
}))

vi.mock("@/lib/invite-codes", () => ({
  ensureInviteCodeForOrganization: vi.fn(),
}))

vi.mock("@/lib/rbac/default-role-permissions", () => ({
  ensureDefaultRolesAndPermissions: vi.fn(),
}))

import { POST as POST_OWNER_START } from "../app/api/onboarding/owner/start/route"

describe("owner onboarding start route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSessionUser.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    })
  })

  it("blocks managers from creating a new venue", async () => {
    mocked.prisma.organizationMember.findMany.mockResolvedValue([
      {
        legacyRole: "manager",
        accessRole: { key: "manager" },
      },
    ])

    const response = await POST_OWNER_START(
      new Request("http://localhost/api/onboarding/owner/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceNew: true }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe("Менеджер не может создавать новое заведение")
    expect(mocked.prisma.organizationMember.findFirst).not.toHaveBeenCalled()
    expect(mocked.prisma.$transaction).not.toHaveBeenCalled()
  })
})
