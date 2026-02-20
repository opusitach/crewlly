import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export const SESSION_COOKIE = "session_token"
const SESSION_TTL_DAYS = 30

const isSecureCookie =
  (typeof process !== "undefined" && process.env.COOKIE_SECURE === "true") ||
  (typeof process !== "undefined" && process.env.NODE_ENV === "production")

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function createSession(userId: string) {
  const token = crypto.randomUUID()
  const expires = new Date()
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS)

  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt: expires,
    },
  })

  return {
    token,
    cookie: {
      name: SESSION_COOKIE,
      value: token,
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: isSecureCookie,
        path: "/",
        expires,
      },
    },
  }
}

export async function getSessionTokenFromCookies(): Promise<string | null> {
  try {
    const store = await cookies()
    return store.get(SESSION_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

export async function deleteSessionByToken(token?: string) {
  if (token) {
    await prisma.session.deleteMany({ where: { token } })
  }
}

export async function deleteUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } })
}

export async function getSessionUser() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) {
      return null
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!session) {
      return null
    }
    if (session.expiresAt && session.expiresAt < new Date()) {
      return null
    }

    return session.user
  } catch (error) {
    console.error("[auth] getSessionUser error", error)
    return null
  }
}

/**
 * Get current user with organization membership
 */
export async function getSessionUserWithOrg() {
  try {
    const user = await getSessionUser()
    if (!user) return null

    const preferredMembership = user.activeOrganizationId
      ? await prisma.organizationMember.findFirst({
          where: {
            userId: user.id,
            organizationId: user.activeOrganizationId,
            isActive: true,
          },
          include: {
            organization: true,
            accessRole: true,
          },
        })
      : null

    const membership =
      preferredMembership ??
      (await prisma.organizationMember.findFirst({
        where: { userId: user.id, isActive: true },
        include: {
          organization: true,
          accessRole: true,
        },
      }))

    return {
      user,
      membership,
      organization: membership?.organization ?? null,
      accessRole: membership?.accessRole ?? null,
    }
  } catch (error) {
    console.error("[auth] getSessionUserWithOrg error", error)
    return null
  }
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(userId: string, organizationId: string, permissionKey: string): Promise<boolean> {
  try {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
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

    if (!membership?.accessRole) {
      // Fallback to legacy role check
      if (membership?.legacyRole === "owner") return true
      return false
    }

    return membership.accessRole.permissions.some(
      (rp) => rp.permission.key === permissionKey
    )
  } catch (error) {
    console.error("[auth] hasPermission error", error)
    return false
  }
}

export function isOwnerOrManagerRole(membership: {
  isActive?: boolean
  legacyRole?: string | null
  accessRole?: { key?: string | null } | null
} | null) {
  if (!membership?.isActive) return false
  const roleKey = membership.accessRole?.key ?? membership.legacyRole ?? null
  return roleKey === "owner" || roleKey === "manager"
}

export function isOwnerRole(membership: {
  isActive?: boolean
  legacyRole?: string | null
  accessRole?: { key?: string | null } | null
} | null) {
  if (!membership?.isActive) return false
  const roleKey = membership.accessRole?.key ?? membership.legacyRole ?? null
  return roleKey === "owner"
}

/**
 * Get user's employee record for an organization
 */
export async function getUserEmployee(userId: string, organizationId: string) {
  return prisma.employee.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    include: {
      employeePositions: {
        include: { position: true },
      },
      employeeLocations: {
        include: { location: true },
      },
    },
  })
}
