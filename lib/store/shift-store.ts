import { create } from "zustand"
import type {
  Employee,
  IntervalConflict,
  Position,
  WorkInterval,
  Workday,
  DateRange,
  CalendarView,
  ShiftFilter,
} from "@/lib/types/shift"
import type { PayComponentInput, PayComponentType } from "@/lib/pay-components"

type IntervalPayloadBase = {
  workdayId?: string
  employeeId?: string
  positionId?: string
  startAt?: string
  endAt?: string
  breakMinutes?: number
  revenueCents?: number | null
  notes?: string
  useCustomPay?: boolean
  payComponents?: PayComponentInput[]
  customPayType?: PayComponentType | PayComponentType[] | null
  customHourlyRateCents?: number | null
  customShiftRateCents?: number | null
  customPercentRevenueBp?: number | null
  status?: WorkInterval["status"]
}

type CreateIntervalPayload = IntervalPayloadBase & {
  workdayId: string
  employeeId: string
  positionId: string
  startAt: string
  endAt: string
  allowConflictStatus?: boolean
}

interface ShiftStore {
  // User context
  userId?: string
  organizationId?: string
  isHydrated: boolean
  isLoading: boolean

  // Data
  employees: Employee[]
  positions: Position[]
  workdays: Workday[]
  intervals: WorkInterval[]

  // UI State
  currentDate: Date
  selectedDates: string[]
  dateRange: DateRange | null
  calendarView: CalendarView
  filter: ShiftFilter
  selectedLocationId: string | null

  // Actions
  setUserId: (userId: string) => void
  setOrganizationId: (organizationId: string) => void
  setSelectedLocation: (locationId: string) => void
  hydrate: () => Promise<void>
  
  // Fetch from API
  refreshEmployees: () => Promise<void>
  refreshPositions: () => Promise<void>
  refreshWorkdays: (dateFrom?: string, dateTo?: string) => Promise<void>
  
  // UI actions
  setCurrentDate: (date: Date) => void
  setCalendarView: (view: CalendarView) => void
  setFilter: (filter: ShiftFilter) => void

  // Date selection
  selectDate: (date: string) => void
  selectDateRange: (range: DateRange) => void
  clearSelection: () => void
  toggleDateSelection: (date: string) => void

  // Interval actions (CRUD via API)
  createInterval: (data: CreateIntervalPayload) => Promise<WorkInterval | null>
  updateInterval: (id: string, data: IntervalPayloadBase) => Promise<WorkInterval | null>
  deleteInterval: (id: string) => Promise<void>
  lastIntervalError: string | null
  lastIntervalErrorCode: string | null
  lastIntervalConflicts: IntervalConflict[] | null
  
  // Workday actions
  getOrCreateWorkday: (date: string) => Promise<Workday | null>
  publishWorkday: (id: string) => Promise<void>

  // Getters
  getFilteredIntervals: () => WorkInterval[]
  getIntervalsByDate: (date: string) => WorkInterval[]
  getEmployeeById: (id: string) => Employee | undefined
  getPositionById: (id: string) => Position | undefined

  // Employee helpers
  addEmployee: (employee: Employee) => void
  updateEmployee: (id: string, data: Partial<Employee>) => void
  deleteEmployee: (id: string) => void
}

export const useShiftStore = create<ShiftStore>()((set, get) => ({
  userId: undefined,
  organizationId: undefined,
  isHydrated: false,
  isLoading: false,
  employees: [],
  positions: [],
  workdays: [],
  intervals: [],
  lastIntervalError: null,
  lastIntervalErrorCode: null,
  lastIntervalConflicts: null,
  currentDate: new Date(),
  selectedDates: [],
  dateRange: null,
  calendarView: "month",
  filter: {},
  selectedLocationId: null,

  setUserId: (userId) => set({ userId }),
  setOrganizationId: (organizationId) => set({ organizationId }),
  setSelectedLocation: (locationId) => set({ selectedLocationId: locationId }),

  hydrate: async () => {
    try {
      set({ isLoading: true })
      
      // Fetch user info
      const meRes = await fetch("/api/auth/me", { credentials: "include" })
      if (meRes.ok) {
        const meJson = await meRes.json()
        if (meJson.user) {
          set({ userId: meJson.user.id })
        }
        if (meJson.organization) {
          set({ organizationId: meJson.organization.id })
        }
        if (meJson.defaultLocation) {
          set({ selectedLocationId: meJson.defaultLocation.id })
        }
      }

      // Fetch employees and positions
      await Promise.all([
        get().refreshEmployees(),
        get().refreshPositions(),
      ])

      // Fetch workdays for current month
      const today = new Date()
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      
      await get().refreshWorkdays(
        startOfMonth.toISOString().split("T")[0],
        endOfMonth.toISOString().split("T")[0]
      )

      set({ isHydrated: true, isLoading: false })
    } catch (error) {
      console.error("Failed to hydrate shift store", error)
      set({ isHydrated: true, isLoading: false })
    }
  },

  refreshEmployees: async () => {
    try {
      const res = await fetch("/api/employees", { credentials: "include" })
      if (!res.ok) return
      const json = await res.json()
      set({ employees: json?.data ?? [] })
    } catch (error) {
      console.error("Failed to fetch employees", error)
    }
  },

  refreshPositions: async () => {
    try {
      const res = await fetch("/api/positions", { credentials: "include", cache: "no-store" })
      if (!res.ok) return
      const json = await res.json()
      set({ positions: json?.data ?? [] })
    } catch (error) {
      console.error("Failed to fetch positions", error)
    }
  },

  refreshWorkdays: async (dateFrom?: string, dateTo?: string) => {
    try {
      const params = new URLSearchParams()
      const locationId = get().selectedLocationId
      if (locationId) params.append("locationId", locationId)
      if (dateFrom) params.append("dateFrom", dateFrom)
      if (dateTo) params.append("dateTo", dateTo)

      const res = await fetch(`/api/workdays?${params}`, { credentials: "include" })
      if (!res.ok) return
      const json = await res.json()
      const workdays = json?.data ?? []
      
      // Extract intervals from workdays
      const allIntervals: WorkInterval[] = []
      for (const wd of workdays) {
        if (wd.intervals) {
          allIntervals.push(...wd.intervals)
        }
      }
      
      set({ workdays, intervals: allIntervals })
    } catch (error) {
      console.error("Failed to fetch workdays", error)
    }
  },

  setCurrentDate: (date) => set({ currentDate: date }),
  setCalendarView: (view) => set({ calendarView: view }),
  setFilter: (filter) => set({ filter }),

  selectDate: (date) => {
    const { selectedDates } = get()
    const isSelected = selectedDates.includes(date)

    if (isSelected) {
      set({ selectedDates: [], dateRange: null })
    } else {
      set({ selectedDates: [date], dateRange: null })
    }
  },

  selectDateRange: (range) => {
    const start = new Date(range.start)
    const end = new Date(range.end)
    const dates: string[] = []

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split("T")[0])
    }

    set({ dateRange: range, selectedDates: dates })
  },

  clearSelection: () => {
    set({ selectedDates: [], dateRange: null })
  },

  toggleDateSelection: (date) => {
    const { selectedDates } = get()
    const isSelected = selectedDates.includes(date)

    if (isSelected) {
      set({ selectedDates: selectedDates.filter((d) => d !== date), dateRange: null })
    } else {
      set({ selectedDates: [...selectedDates, date].sort(), dateRange: null })
    }
  },

  createInterval: async (data: CreateIntervalPayload) => {
    try {
      set({ lastIntervalError: null, lastIntervalErrorCode: null, lastIntervalConflicts: null })
      const res = await fetch("/api/intervals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const error = json?.error
        const fieldErrors = error?.fieldErrors
        const fieldMessages =
          fieldErrors && typeof fieldErrors === "object"
            ? Object.values(fieldErrors).flat().filter(Boolean)
            : []
        const statusInfo = `${res.status} ${res.statusText || ""}`.trim()
        const message =
          typeof error === "string"
            ? error
            : Array.isArray(error?.formErrors) && error.formErrors.length > 0
              ? error.formErrors.join(", ")
              : fieldMessages.length > 0
                ? fieldMessages.join(", ")
                : `Не удалось создать смену (${statusInfo})`
        set({
          lastIntervalError: message,
          lastIntervalErrorCode: json?.code ?? null,
          lastIntervalConflicts: Array.isArray(json?.conflicts) ? json.conflicts : null,
        })
        if (process.env.NODE_ENV !== "production") {
          console.warn("Failed to create interval", message)
        }
        return null
      }
      const newInterval = json?.data
      if (newInterval) {
        set((state) => ({ intervals: [...state.intervals, newInterval] }))
      }
      set({ lastIntervalError: null, lastIntervalErrorCode: null, lastIntervalConflicts: null })
      return newInterval
    } catch (error: any) {
      const message = error?.message || "Не удалось создать смену"
      set({ lastIntervalError: message, lastIntervalErrorCode: null, lastIntervalConflicts: null })
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to create interval", error)
      }
      return null
    }
  },

  updateInterval: async (id, data) => {
    try {
      set({ lastIntervalError: null, lastIntervalErrorCode: null, lastIntervalConflicts: null })
      const res = await fetch("/api/intervals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, ...data }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const error = json?.error
        const fieldErrors = error?.fieldErrors
        const fieldMessages =
          fieldErrors && typeof fieldErrors === "object"
            ? Object.values(fieldErrors).flat().filter(Boolean)
            : []
        const statusInfo = `${res.status} ${res.statusText || ""}`.trim()
        const message =
          typeof error === "string"
            ? error
            : Array.isArray(error?.formErrors) && error.formErrors.length > 0
              ? error.formErrors.join(", ")
              : fieldMessages.length > 0
                ? fieldMessages.join(", ")
                : `Не удалось обновить смену (${statusInfo})`
        set({
          lastIntervalError: message,
          lastIntervalErrorCode: json?.code ?? null,
          lastIntervalConflicts: Array.isArray(json?.conflicts) ? json.conflicts : null,
        })
        if (process.env.NODE_ENV !== "production") {
          console.warn("Failed to update interval", message)
        }
        return null
      }
      const updated = json?.data
      if (updated) {
        set((state) => ({
          intervals: state.intervals.map((int) => (int.id === id ? { ...int, ...updated } : int)),
        }))
      }
      set({ lastIntervalError: null, lastIntervalErrorCode: null, lastIntervalConflicts: null })
      return updated ?? null
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить смену"
      set({ lastIntervalError: message, lastIntervalErrorCode: null, lastIntervalConflicts: null })
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to update interval", error)
      }
      return null
    }
  },

  deleteInterval: async (id) => {
    try {
      const res = await fetch(`/api/intervals?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) return
      set((state) => ({ intervals: state.intervals.filter((int) => int.id !== id) }))
    } catch (error) {
      console.error("Failed to delete interval", error)
    }
  },

  getOrCreateWorkday: async (date) => {
    const locationId = get().selectedLocationId
    if (!locationId) return null

    // Check if exists locally
    const existing = get().workdays.find(
      (wd) => wd.workDate === date && wd.locationId === locationId
    )
    if (existing) return existing

    try {
      const res = await fetch("/api/workdays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ locationId, workDate: date }),
      })
      if (!res.ok) return null
      const json = await res.json()
      const newWorkday = json?.data
      if (newWorkday) {
        set((state) => ({ workdays: [...state.workdays, newWorkday] }))
      }
      return newWorkday
    } catch (error) {
      console.error("Failed to create workday", error)
      return null
    }
  },

  publishWorkday: async (id) => {
    try {
      const res = await fetch(`/api/workdays/${id}/publish`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) return
      set((state) => ({
        workdays: state.workdays.map((wd) =>
          wd.id === id ? { ...wd, status: "published" as const, publishedAt: new Date().toISOString() } : wd
        ),
      }))
    } catch (error) {
      console.error("Failed to publish workday", error)
    }
  },

  getFilteredIntervals: () => {
    const { intervals, filter } = get()

    return intervals.filter((interval) => {
      if (filter.employeeId && interval.employeeId !== filter.employeeId) {
        return false
      }
      if (filter.positionId && interval.positionId !== filter.positionId) {
        return false
      }
      if (filter.status && interval.status !== filter.status) {
        return false
      }
      return true
    })
  },

  getIntervalsByDate: (date) => {
    const workday = get().workdays.find((wd) => wd.workDate === date)
    if (!workday) return []
    return get().intervals.filter((int) => int.workdayId === workday.id)
  },

  getEmployeeById: (id) => get().employees.find((emp) => emp.id === id),
  getPositionById: (id) => get().positions.find((pos) => pos.id === id),

  addEmployee: (employee) =>
    set((state) => ({
      employees: [...state.employees, employee],
    })),
  updateEmployee: (id, data) =>
    set((state) => ({
      employees: state.employees.map((emp) => (emp.id === id ? { ...emp, ...data } : emp)),
    })),
  deleteEmployee: (id) =>
    set((state) => ({
      employees: state.employees.filter((emp) => emp.id !== id),
    })),
}))
