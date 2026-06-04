"use client"

import { useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { ShiftsPageSkeleton } from "@/components/ui/page-skeletons"
import { ChevronLeft } from "lucide-react"
import { useAuthStore } from "@/lib/store/auth-store"
import { useShiftStore } from "@/lib/store/shift-store"
import { useTranslation } from "@/lib/i18n/context"

const ShiftsView = dynamic(() => import("@/components/shifts-view"), {
  ssr: false,
  loading: () => <ShiftsPageSkeleton />,
})

type WorkerShiftPlannerProps = {
  onBack: () => void
  hideHeader?: boolean
  initialDate?: string
  initialSelectedIntervalId?: string | null
  initialOpenWeekView?: boolean
  onInitialNavigationHandled?: () => void
}

export default function WorkerShiftPlanner({
  onBack,
  hideHeader = false,
  initialDate,
  initialSelectedIntervalId,
  initialOpenWeekView = false,
  onInitialNavigationHandled,
}: WorkerShiftPlannerProps) {
  const { t } = useTranslation()
  const { user, isHydrated: isAuthHydrated, hydrate: hydrateAuth, isAuthenticated } = useAuthStore()
  const {
    employees,
    isHydrated: isShiftsHydrated,
    isLoading: isShiftsLoading,
    hydrate: hydrateShifts,
  } = useShiftStore()

  useEffect(() => {
    if (!isAuthHydrated) {
      void hydrateAuth()
    }
  }, [hydrateAuth, isAuthHydrated])

  useEffect(() => {
    if (!isAuthHydrated || !isAuthenticated) return
    if (isShiftsHydrated || isShiftsLoading) return
    void hydrateShifts()
  }, [hydrateShifts, isAuthHydrated, isAuthenticated, isShiftsHydrated, isShiftsLoading])

  const employeeId = useMemo(() => {
    if (!user?.id) return null
    return employees.find((employee) => employee.userId === user.id)?.id ?? null
  }, [employees, user?.id])

  if (isShiftsLoading || !isShiftsHydrated) {
    return <ShiftsPageSkeleton />
  }

  if (!employeeId) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto">
        {!hideHeader && (
          <div className="sticky top-0 z-10 bg-background border-b border-border">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
                </Button>
                <h1 className="text-xl font-semibold">{t("owner_tab_shifts")}</h1>
                <div className="w-10" />
              </div>
            </div>
          </div>
        )}
        <div className="p-4 text-sm text-muted-foreground">{t("worker_planner_no_employee")}</div>
      </div>
    )
  }

  return (
    <ShiftsView
      onBack={onBack}
      readOnly
      hideFilters
      lockedEmployeeId={employeeId}
      initialDate={initialDate}
      initialSelectedIntervalId={initialSelectedIntervalId}
      initialOpenWeekView={initialOpenWeekView}
      onInitialNavigationHandled={onInitialNavigationHandled}
      externalHeader
    />
  )
}
