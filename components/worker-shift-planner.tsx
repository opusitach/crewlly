"use client"

import { useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { useAuthStore } from "@/lib/store/auth-store"
import { useShiftStore } from "@/lib/store/shift-store"

const ShiftsView = dynamic(() => import("@/components/shifts-view"), { ssr: false })

type WorkerShiftPlannerProps = {
  onBack: () => void
  hideHeader?: boolean
  initialDate?: string
  initialOpenWeekView?: boolean
  onInitialNavigationHandled?: () => void
}

export default function WorkerShiftPlanner({
  onBack,
  hideHeader = false,
  initialDate,
  initialOpenWeekView = false,
  onInitialNavigationHandled,
}: WorkerShiftPlannerProps) {
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

  if (!employeeId || isShiftsLoading || !isShiftsHydrated) {
    const message =
      !isShiftsLoading && isShiftsHydrated
        ? "Не удалось определить сотрудника"
        : "Загрузка смен..."
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto">
        {!hideHeader && (
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
                </Button>
                <h1 className="text-xl font-semibold">Смены</h1>
                <div className="w-10" />
              </div>
            </div>
          </div>
        )}
        <div className="p-4 text-sm text-muted-foreground">{message}</div>
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
      initialOpenWeekView={initialOpenWeekView}
      onInitialNavigationHandled={onInitialNavigationHandled}
      externalHeader={hideHeader}
    />
  )
}
