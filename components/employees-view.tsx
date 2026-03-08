"use client"

import { useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, ChevronLeft, Filter, Plus, Search, User } from "lucide-react"
import AddEmployeeWizard from "@/components/add-employee-wizard"
import EmployeeProfile from "@/components/employee-profile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useShiftStore } from "@/lib/store/shift-store"
import type { PayComponent } from "@/lib/pay-components"
import { formatPhoneForDisplay } from "@/lib/validation/phone"

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
      <div className="min-h-screen bg-background pb-4 max-w-md mx-auto flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    )
  }

  if (selectedEmployeeId) {
    return <EmployeeProfile employeeId={selectedEmployeeId} onBack={() => setSelectedEmployeeId(null)} />
  }

  return (
    <div className="min-h-screen bg-background pb-4 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <div className="text-sm font-semibold">Команда</div>
            <Button variant="ghost" size="icon" className="rounded-full h-9 w-9" disabled>
              <Filter className="h-5 w-5" strokeWidth={1.5} />
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Поиск сотрудника..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-10 h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Card className="p-2 text-center overflow-hidden">
              <p className="text-xl font-bold">{employees.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Всего</p>
            </Card>
            <Card className="p-2 text-center overflow-hidden">
              <p className="text-xl font-bold text-primary">{employees.filter((employee) => employee.status === "active").length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Активных</p>
            </Card>
            <Card className="p-2 text-center overflow-hidden">
              <p className="text-xl font-bold text-destructive">
                {employees.filter((employee) => employee.status === "needs_setup").length}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Настроить</p>
            </Card>
          </div>

          <Button className="h-9 text-sm w-full" onClick={() => setShowAddWizard(true)}>
            <Plus className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
            Добавить сотрудника
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Команда ({filteredEmployees.length})
        </h2>

        {filteredEmployees.length === 0 && (
          <Card className="p-6 text-center">
            <div className="h-10 w-10 rounded-full bg-muted mx-auto flex items-center justify-center mb-2">
              <User className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="font-medium text-sm mb-1">Сотрудников не найдено</h3>
            <p className="text-xs text-muted-foreground">Попробуйте изменить запрос</p>
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
                      {employee.accessRoleName ?? "Менеджер"}
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
                      Без должности
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
                      <span className="text-[10px] text-primary font-medium truncate">Активен</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" strokeWidth={2} />
                      <span className="text-[10px] text-destructive font-medium truncate">Настроить оплату</span>
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
