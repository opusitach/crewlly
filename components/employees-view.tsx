"use client"

import { useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, ChevronLeft, Plus, Search, User } from "lucide-react"
import AddEmployeeWizard from "@/components/add-employee-wizard"
import EmployeeProfile from "@/components/employee-profile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useShiftStore } from "@/lib/store/shift-store"
import type { PayComponent } from "@/lib/pay-components"
import { formatPhoneForDisplay } from "@/lib/validation/phone"
import { useTranslation } from "@/lib/i18n/context"

type EmployeeView = {
  id: string
  name: string
  positions: string[]
  status: "active" | "needs_setup"
  phone?: string
  accessRoleKey?: string
  accessRoleName?: string
}

const hasConfiguredPay = (payComponents: PayComponent[] | undefined) =>
  Boolean(payComponents?.some((component) => component.isActive && (component.amountCents != null || component.rateBp != null)))

export default function EmployeesView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [showAddWizard, setShowAddWizard] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const { employees: storeEmployees, isHydrated, refreshEmployees } = useShiftStore()

  const employees: EmployeeView[] = useMemo(() => {
    return storeEmployees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      positions: employee.positions?.map((position) => position.name) ?? [],
      status: hasConfiguredPay(employee.payComponents) ? "active" : "needs_setup",
      phone: employee.phone,
      accessRoleKey: employee.accessRoleKey,
      accessRoleName: employee.accessRoleName,
    }))
  }, [storeEmployees])

  const filteredEmployees = useMemo(
    () => employees.filter((employee) => employee.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [employees, searchQuery],
  )

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background pb-24 max-w-md mx-auto" role="status" aria-label={t("employees_loading")}>
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
            <Skeleton className="h-9 w-full rounded-md" />
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((item) => (
                <Card key={item} className="space-y-2 p-2">
                  <Skeleton className="mx-auto h-6 w-8" />
                  <Skeleton className="mx-auto h-3 w-14" />
                </Card>
              ))}
            </div>
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
        <div className="space-y-2 p-3">
          <Skeleton className="h-4 w-28" />
          {[1, 2, 3, 4].map((item) => (
            <Card key={item} className="p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (selectedEmployeeId) {
    return <EmployeeProfile employeeId={selectedEmployeeId} onBack={() => setSelectedEmployeeId(null)} />
  }

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold">{t("employees_team")}</h1>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder={t("employees_search")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-10 h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Card className="p-2 text-center overflow-hidden">
              <p className="text-xl font-bold">{employees.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{t("employees_total")}</p>
            </Card>
            <Card className="p-2 text-center overflow-hidden">
              <p className="text-xl font-bold text-primary">{employees.filter((employee) => employee.status === "active").length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{t("employees_active")}</p>
            </Card>
            <Card className="p-2 text-center overflow-hidden">
              <p className="text-xl font-bold text-destructive">
                {employees.filter((employee) => employee.status === "needs_setup").length}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{t("employees_configure")}</p>
            </Card>
          </div>

          <Button className="h-9 text-sm w-full" onClick={() => setShowAddWizard(true)}>
            <Plus className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
            {t("employees_add")}
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {filteredEmployees.length === 0 && (
          <Card className="p-6 text-center">
            <div className="h-10 w-10 rounded-full bg-muted mx-auto flex items-center justify-center mb-2">
              <User className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="font-medium text-sm mb-1">{t("employees_not_found")}</h3>
            <p className="text-xs text-muted-foreground">{t("employees_not_found_hint")}</p>
          </Card>
        )}

        {filteredEmployees.map((employee) => (
          <Card
            key={employee.id}
            className="p-3 cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
            onClick={() => setSelectedEmployeeId(employee.id)}
          >
            <div className="flex items-start gap-2.5">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm truncate">{employee.name}</h3>
                  {employee.accessRoleKey === "manager" && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {employee.accessRoleName ?? t("employees_default_role")}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5 mb-1.5">
                  {employee.positions.length > 0 ? (
                    employee.positions.map((position) => (
                      <Badge key={`${employee.id}-${position}`} variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                        {position}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                      {t("employees_no_position")}
                    </Badge>
                  )}
                </div>
                {employee.phone && (
                  <p className="text-[11px] text-muted-foreground truncate">{formatPhoneForDisplay(employee.phone)}</p>
                )}
                <div className="flex items-center gap-1 mt-1.5">
                  {employee.status === "active" ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" strokeWidth={2} />
                      <span className="text-[10px] text-primary font-medium truncate">{t("employees_active_badge")}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" strokeWidth={2} />
                      <span className="text-[10px] text-destructive font-medium truncate">{t("employees_configure_pay")}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={showAddWizard} onOpenChange={setShowAddWizard}>
        <DialogContent className="p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">Код приглашения сотрудника</DialogTitle>
          <DialogDescription className="sr-only">
            Модальное окно с кодом приглашения для добавления сотрудника в команду.
          </DialogDescription>
          <AddEmployeeWizard
            variant="modal"
            onBack={() => setShowAddWizard(false)}
            onComplete={() => {
              setShowAddWizard(false)
              void refreshEmployees()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
