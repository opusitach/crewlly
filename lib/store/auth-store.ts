import { create } from "zustand"

interface User {
  id: string
  name?: string
  fullName?: string
  email: string
  emailVerifiedAt?: string | null
  phone?: string
  avatarUrl?: string
  locale: string
  status: string
  primaryMode: "owner" | "worker" | null
  onboardingReady: boolean
}

interface Organization {
  id: string
  name: string
  timezone: string
  currency: string
}

interface AccessRole {
  id: string
  key: string
  name: string
}

type UserUpdateInput = {
  fullName?: string
  name?: string
  email?: string
  phone?: string | null
  avatarUrl?: string | null
}

interface Venue {
  id: string
  name: string
  address?: string | null
  city?: string | null
  timezone?: string
  currency?: string
  locations?: { id: string; name: string; addressText?: string | null }[]
  role?: string | null
}

interface AuthStore {
  // State
  user: User | null
  organization: Organization | null
  accessRole: AccessRole | null
  legacyRole: string | null
  defaultLocationId: string | null
  isLoading: boolean
  isAuthenticated: boolean
  isHydrated: boolean
  venues: Venue[]
  selectedVenueId: string | null

  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  register: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<{
    success: boolean
    error?: string
    verificationRequired?: boolean
    pendingRegistration?: {
      email: string
      expiresAt: string
      resendAvailableAt: string
    }
  }>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  setRole: (primaryMode: "owner" | "worker") => Promise<{ success: boolean; error?: string }>
  hydrate: () => Promise<void>
  selectVenue: (venueId: string) => Promise<void>
  addVenue: (data: Partial<Venue> & { name: string }) => Promise<void>
  updateVenue: (venueId: string, data: Partial<Venue>) => Promise<void>
  updateUser: (data: UserUpdateInput) => Promise<void>
  clear: () => void
}

const mapUser = (raw: any): User => ({
  id: raw.id,
  name: raw.fullName ?? raw.name ?? "",
  fullName: raw.fullName ?? raw.name ?? "",
  email: raw.email ?? "",
  emailVerifiedAt: raw.emailVerifiedAt ?? null,
  phone: raw.phone ?? undefined,
  avatarUrl: raw.avatarUrl ?? undefined,
  locale: raw.locale ?? "ru",
  status: raw.status ?? "active",
  primaryMode: raw.primaryMode ?? null,
  onboardingReady: Boolean(raw.onboardingReady),
})

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  organization: null,
  accessRole: null,
  legacyRole: null,
  defaultLocationId: null,
  isLoading: true,
  isAuthenticated: false,
  isHydrated: false,
  venues: [],
  selectedVenueId: null,

  login: async (email, password) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      
      if (!res.ok) {
        return { success: false, error: json.error || "Ошибка входа" }
      }

      const mappedUser = mapUser(json.user)
      set({
        user: mappedUser,
        organization: json.organization,
        accessRole: json.accessRole,
        legacyRole: json.legacyRole ?? null,
        isAuthenticated: true,
        isHydrated: false,
        venues: [],
        selectedVenueId: null,
      })

      return { success: true }
    } catch (error) {
      console.error("Login error", error)
      return { success: false, error: "Ошибка сети" }
    }
  },

  register: async (fullName, email, password) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fullName, email, password }),
      })
      const json = await res.json()
      
      if (!res.ok) {
        const errorMsg = typeof json.error === "string" ? json.error : "Ошибка регистрации"
        return { success: false, error: errorMsg }
      }

      if (json.verificationRequired) {
        return {
          success: true,
          verificationRequired: true,
          pendingRegistration: json.pendingRegistration,
        }
      }

      const mappedUser = mapUser(json.user)
      set({
        user: mappedUser,
        organization: null,
        accessRole: null,
        legacyRole: null,
        isAuthenticated: true,
        isHydrated: false,
        venues: [],
        selectedVenueId: null,
      })

      return { success: true }
    } catch (error) {
      console.error("Register error", error)
      return { success: false, error: "Ошибка сети" }
    }
  },

  logout: async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } catch (error) {
      console.error("Logout error", error)
      } finally {
        set({
          user: null,
        organization: null,
        accessRole: null,
        legacyRole: null,
        defaultLocationId: null,
          isAuthenticated: false,
          isHydrated: true,
          isLoading: false,
          venues: [],
          selectedVenueId: null,
        })
      }
    },

  fetchMe: async () => {
    try {
      set({ isLoading: true })
      const res = await fetch("/api/auth/me", { credentials: "include" })
      
      if (!res.ok) {
        set({ isLoading: false, isAuthenticated: false })
        return
      }

      const json = await res.json()
      const mappedUser = mapUser(json.user)
      set({
        user: mappedUser,
        organization: json.organization,
        accessRole: json.accessRole,
        legacyRole: json.legacyRole ?? null,
        defaultLocationId: json.defaultLocation?.id ?? null,
        isLoading: false,
        isAuthenticated: true,
      })
    } catch (error) {
      console.error("Fetch me error", error)
      set({ isLoading: false, isAuthenticated: false })
    }
  },

  setRole: async (primaryMode) => {
    try {
      const res = await fetch("/api/user/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ primaryMode }),
      })
      const json = await res.json()
      
      if (!res.ok) {
        return { success: false, error: json.error || "Ошибка" }
      }

      set((state) => ({
        user: state.user ? { ...state.user, primaryMode } : null,
      }))

      return { success: true }
    } catch (error) {
      console.error("Set role error", error)
      return { success: false, error: "Ошибка сети" }
    }
  },

  hydrate: async () => {
    try {
      set({ isLoading: true })

      const meRes = await fetch("/api/auth/me", { credentials: "include" })
      if (!meRes.ok) {
        set({ isLoading: false, isAuthenticated: false, isHydrated: true })
        return
      }

      const meJson = await meRes.json()
      const mappedUser = mapUser(meJson.user)

      set({
        user: mappedUser,
        organization: meJson.organization,
        accessRole: meJson.accessRole,
        legacyRole: meJson.legacyRole ?? null,
        defaultLocationId: meJson.defaultLocation?.id ?? null,
        isAuthenticated: true,
      })

      let venues: Venue[] = []
      const venuesRes = await fetch("/api/venues", { credentials: "include" })
      if (venuesRes.ok) {
        const venuesJson = await venuesRes.json()
        venues = Array.isArray(venuesJson?.data) ? venuesJson.data : []
      } else if (meJson.organization) {
        venues = [
          {
            id: meJson.organization.id,
            name: meJson.organization.name,
            timezone: meJson.organization.timezone,
            currency: meJson.organization.currency,
          },
        ]
      }

      const currentSelected = get().selectedVenueId
      const activeVenueId = typeof meJson?.organization?.id === "string" ? meJson.organization.id : null
      const resolvedSelected =
        (activeVenueId && venues.find((venue) => venue.id === activeVenueId)?.id) ??
        (currentSelected && venues.find((venue) => venue.id === currentSelected)?.id) ??
        venues[0]?.id ??
        activeVenueId ??
        null

      set({
        venues,
        selectedVenueId: resolvedSelected,
        isHydrated: true,
        isLoading: false,
      })
    } catch (error) {
      console.error("Failed to hydrate auth store", error)
      set({ isLoading: false, isHydrated: true })
    }
  },

  selectVenue: async (venueId) => {
    const previousState = {
      selectedVenueId: get().selectedVenueId,
      defaultLocationId: get().defaultLocationId,
      organization: get().organization,
      accessRole: get().accessRole,
      legacyRole: get().legacyRole,
    }
    if (previousState.selectedVenueId === venueId) return

    const venue = get().venues.find((item) => item.id === venueId)

    try {
      const res = await fetch("/api/venues/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ organizationId: venueId }),
      })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        const message = typeof json?.error === "string" ? json.error : "Не удалось переключить заведение"
        throw new Error(message)
      }

      const nextOrganization =
        json?.organization ??
        (venue
          ? {
              id: venue.id,
              name: venue.name,
              timezone: venue.timezone ?? previousState.organization?.timezone ?? "Europe/Prague",
              currency: venue.currency ?? previousState.organization?.currency ?? "CZK",
            }
          : previousState.organization)

      const nextLocationId =
        json?.defaultLocation?.id ?? venue?.locations?.[0]?.id ?? previousState.defaultLocationId ?? null

      set({
        selectedVenueId: venueId,
        defaultLocationId: nextLocationId,
        organization: nextOrganization ?? null,
        accessRole: json?.accessRole ?? previousState.accessRole,
        legacyRole:
          typeof json?.legacyRole === "string" || json?.legacyRole === null
            ? json.legacyRole
            : previousState.legacyRole,
      })
    } catch (error) {
      console.error("Failed to switch venue", error)
    }
  },

  addVenue: async (data) => {
    const payload = {
      name: data.name,
      address: data.address ?? undefined,
      city: data.city ?? undefined,
      timezone: data.timezone ?? undefined,
      currency: data.currency ?? undefined,
    }
    const res = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      const message = typeof json?.error === "string" ? json.error : "Не удалось сохранить заведение"
      throw new Error(message)
    }
    const json = await res.json().catch(() => null)
    const created = json?.data
    if (!created?.id) return

    set((state) => {
      const existing = state.venues.find((venue) => venue.id === created.id)
      const merged = {
        id: created.id,
        name: created.name ?? data.name,
        address: created.address ?? data.address ?? existing?.address ?? null,
        city: created.city ?? data.city ?? existing?.city ?? null,
        timezone: created.timezone ?? data.timezone ?? existing?.timezone,
        currency: created.currency ?? data.currency ?? existing?.currency,
        locations: created.locations ?? existing?.locations,
      }
      const venues = existing
        ? state.venues.map((venue) => (venue.id === created.id ? merged : venue))
        : [...state.venues, merged]

      return {
        venues,
        selectedVenueId: merged.id,
      }
    })
  },

  updateVenue: async (venueId, data) => {
    const current = get().venues.find((venue) => venue.id === venueId)
    const name = data.name ?? current?.name
    if (!name) return
    await get().addVenue({
      name,
      address: data.address ?? current?.address ?? undefined,
      city: data.city ?? current?.city ?? undefined,
      timezone: data.timezone ?? current?.timezone ?? undefined,
      currency: data.currency ?? current?.currency ?? undefined,
    })
  },

  updateUser: async (data) => {
    const payload: Record<string, unknown> = {}

    if (data.fullName !== undefined) payload.fullName = data.fullName
    if (data.name !== undefined) payload.name = data.name
    if (data.email !== undefined) payload.email = data.email
    if (data.phone !== undefined) payload.phone = data.phone
    if (data.avatarUrl !== undefined) payload.avatarUrl = data.avatarUrl

    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => null)

    if (!res.ok) {
      const errorMsg =
        typeof json?.error === "string"
          ? json.error
          : "Не удалось обновить профиль"
      throw new Error(errorMsg)
    }

    if (!json?.user) return

    const mappedUser = mapUser(json.user)
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            ...mappedUser,
          }
        : mappedUser,
    }))
  },

  clear: () => {
    set({
      user: null,
      organization: null,
      accessRole: null,
      legacyRole: null,
      defaultLocationId: null,
      isAuthenticated: false,
      isHydrated: false,
      venues: [],
      selectedVenueId: null,
    })
  },
}))
