import type { PayComponent, PayComponentType } from "@/lib/pay-components"

// Position-based types (replacing role-based)
// Includes legacy values for compatibility with shift UI.
export type PayType = PayComponentType | "fixed" | "percent"
export type PayMode = "default" | "custom"
export type IntervalStatus = "scheduled" | "in_progress" | "canceled" | "completed" | "conflict"

export interface IntervalConflict {
  id: string
  workdayId: string
  workDate: string
  employeeId: string
  employeeName: string | null
  positionId: string | null
  positionName: string | null
  startAt: string
  endAt: string
  startTime: string
  endTime: string
  status: string
}

export interface PayInfo {
  payType: PayType
  payValue: number // legacy shift UI
  payValueCents?: number // stored in cents (new system)
  currency?: string
}

// Position (from database)
export interface Position {
  id: string
  organizationId: string
  locationId?: string
  name: string
  isActive: boolean
  sortOrder: number
}

// Employee from database
export interface Employee {
  id: string
  organizationId: string
  userId: string
  employeeCode?: string
  employmentStatus: "active" | "paused" | "terminated"
  payType: PayType
  defaultHourlyRateCents?: number
  defaultShiftRateCents?: number
  percentRevenueBp?: number
  payComponents?: PayComponent[]
  // Legacy fields for shift UI compatibility
  role: EmployeeRole
  pay: PayInfo
  // Joined from user
  fullName?: string
  name: string // alias for fullName for UI compatibility
  email?: string
  phone?: string
  avatarUrl?: string
  accessRoleKey?: string
  accessRoleName?: string
  isManager?: boolean
  createdAt?: string
  // Primary position for display
  primaryPosition?: Position
  positions?: Position[]
}

// Work Interval (replaces Shift)
export interface WorkInterval {
  id: string
  workdayId: string
  employeeId: string
  positionId?: string
  startAt: string // ISO datetime
  endAt: string // ISO datetime
  startTime?: string // HH:mm (from API helpers)
  endTime?: string // HH:mm (from API helpers)
  status: IntervalStatus
  conflictWithIntervalIds?: string[]
  conflicts?: IntervalConflict[]
  openedAt?: string | null
  closedAt?: string | null
  cancelReason?: string | null
  
  // Custom pay override
  useCustomPay: boolean
  payComponents?: PayComponent[]
  
  breakMinutes: number
  revenueCents?: number | null
  calculatedMinutesWorked?: number | null
  calculatedGrossPayCents?: number | null
  payCalculatedAt?: string | null
  notes?: string
  
  // Joined data
  employee?: Employee
  position?: Position
  timeEntry?: {
    id: string
    clockInAt?: string | null
    clockOutAt?: string | null
    clockInPhotoUrl?: string | null
    clockOutPhotoUrl?: string | null
  } | null
}

// Workday (container for intervals)
export interface Workday {
  id: string
  organizationId: string
  locationId: string
  workDate: string // YYYY-MM-DD
  status: "draft" | "published"
  notes?: string
  publishedAt?: string
  intervals?: WorkInterval[]
}

export interface DateRange {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
}

export type CalendarView = "month" | "week" | "day"

export interface ShiftFilter {
  employeeId?: string
  positionId?: string
  role?: EmployeeRole
  status?: IntervalStatus
}

// Legacy types for backwards compatibility during migration
export type EmployeeRole = "waiter" | "bartender" | "manager" | "cook" | "host"
