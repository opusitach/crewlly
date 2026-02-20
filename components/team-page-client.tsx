"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import EmployeesView from "@/components/employees-view"
import OwnerBottomNav, { type OwnerTab } from "@/components/shared/owner-bottom-nav"
import { useShiftStore } from "@/lib/store/shift-store"

export default function TeamPageClient() {
  const router = useRouter()
  const { hydrate, isHydrated } = useShiftStore()

  useEffect(() => {
    if (!isHydrated) {
      void hydrate()
    }
  }, [hydrate, isHydrated])

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
