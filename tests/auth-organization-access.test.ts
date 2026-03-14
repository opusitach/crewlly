import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    organizationMember: {
      findUnique: vi.fn(),
    },
  }

  return {
    prisma,
    cookies: vi.fn(),
  }
})

vi.mock("next/headers", () => ({
  cookies: mocked.cookies,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

import { hasOrganizationActionAccess } from "../lib/auth"

describe("hasOrganizationActionAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows legacy managers via management fallback without extra permission lookup", async () => {
    const allowed = await hasOrganizationActionAccess(
      {
        user: { id: "user_1" },
        organization: { id: "org_1" },
        membership: { isActive: true, legacyRole: "manager", accessRole: null },
      } as any,
      {
        permission: "interval:create",
        allowManagementRole: true,
      },
    )

    expect(allowed).toBe(true)
    expect(mocked.prisma.organizationMember.findUnique).not.toHaveBeenCalled()
  })

  it("allows custom roles when the requested permission is present", async () => {
    mocked.prisma.organizationMember.findUnique.mockResolvedValue({
      accessRole: {
        permissions: [
          {
            permission: { key: "workday:create" },
          },
        ],
      },
      legacyRole: "worker",
    })

    const allowed = await hasOrganizationActionAccess(
      {
        user: { id: "user_2" },
        organization: { id: "org_2" },
        membership: {
          isActive: true,
          legacyRole: "worker",
          accessRole: { key: "scheduler" },
        },
      } as any,
      {
        permission: "workday:create",
      },
    )

    expect(allowed).toBe(true)
    expect(mocked.prisma.organizationMember.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: "org_2",
          userId: "user_2",
        },
      },
      include: {
        accessRole: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    })
  })

  it("denies workers when neither management fallback nor permission grants access", async () => {
    mocked.prisma.organizationMember.findUnique.mockResolvedValue({
      accessRole: {
        permissions: [],
      },
      legacyRole: "worker",
    })

    const allowed = await hasOrganizationActionAccess(
      {
        user: { id: "user_3" },
        organization: { id: "org_3" },
        membership: {
          isActive: true,
          legacyRole: "worker",
          accessRole: { key: "worker" },
        },
      } as any,
      {
        permission: "employee:create",
        allowManagementRole: true,
      },
    )

    expect(allowed).toBe(false)
  })
})
