"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import EmployeesView from "@/components/employees-view"
import OwnerBottomNav, { type OwnerTab } from "@/components/shared/owner-bottom-nav"
import { useAuthStore } from "@/lib/store/auth-store"
import { useShiftStore } from "@/lib/store/shift-store"

export default function TeamPageClient() {
  const router = useRouter()
  const { hydrate, isHydrated } = useShiftStore()
  const { hydrate: hydrateAuth, isHydrated: isAuthHydrated } = useAuthStore()

  useEffect(() => {
    if (!isHydrated) {
      void hydrate()
    }
  }, [hydrate, isHydrated])

  useEffect(() => {
    if (!isAuthHydrated) {
      void hydrateAuth()
    }
  }, [hydrateAuth, isAuthHydrated])

  const handleTabChange = (tab: OwnerTab) => {
    const next = tab === "dashboard" ? "/app" : `/app?tab=${tab}`
    router.push(next)
  }

  return (
    <>
      <EmployeesView onBack={() => router.push("/app")} />
      <OwnerBottomNav activeTab="dashboard" onTabChange={handleTabChange} />
    </>
  )
}
