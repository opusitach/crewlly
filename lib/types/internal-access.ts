export type InternalAccessLevel = "owner_view" | "employee_view"
export type InternalAccessScope = "all_establishments"

export interface InternalGlobalAccessRecord {
  id: string
  userId: string
  accessLevel: InternalAccessLevel
  scope: InternalAccessScope
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}
