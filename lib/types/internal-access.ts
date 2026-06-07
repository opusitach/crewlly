export type InternalAccessLevel = "owner_view" | "employee_view" | "super_admin"
export type InternalAccessScope = "all_establishments"

/**
 * Access levels that can be "opened" against an organization in the main app
 * (owner/employee mode). `super_admin` is a platform-management level only — it
 * never grants organization access on its own.
 */
export const ORGANIZATION_INTERNAL_LEVELS = ["owner_view", "employee_view"] as const
export type OrganizationInternalLevel = (typeof ORGANIZATION_INTERNAL_LEVELS)[number]

/** All valid internal access levels, including the platform-management level. */
export const ALL_INTERNAL_ACCESS_LEVELS = [
  "owner_view",
  "employee_view",
  "super_admin",
] as const

export function isOrganizationInternalLevel(
  level: InternalAccessLevel,
): level is OrganizationInternalLevel {
  return level === "owner_view" || level === "employee_view"
}

export interface InternalGlobalAccessRecord {
  id: string
  userId: string
  accessLevel: InternalAccessLevel
  scope: InternalAccessScope
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}
