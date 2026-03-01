"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ChevronLeft,
  User,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Percent,
  Clock,
  TrendingUp,
  Edit,
  AlertTriangle,
  Archive,
  Trash2,
  X,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useShiftStore } from "@/lib/store/shift-store"
import type { PayComponent } from "@/lib/pay-components"

type EmployeePosition = { id: string; name: string }

const PAY_OPTIONS = [
  { key: "hourly", label: "Почасовая ставка", suffix: "CZK/ч", icon: Clock },
  { key: "fixed_shift", label: "Фикс за смену", suffix: "CZK", icon: DollarSign },
  { key: "percent_revenue", label: "% от выручки", suffix: "%", icon: Percent },
] as const

type PayKey = (typeof PAY_OPTIONS)[number]["key"]

type PayState = Record<PayKey, { isActive: boolean; value: string }>

const DEFAULT_PAY_STATE: PayState = {
  hourly: { isActive: false, value: "" },
  fixed_shift: { isActive: false, value: "" },
  percent_revenue: { isActive: false, value: "" },
}

const parseNumericInput = (value: string): number | null => {
  const raw = value.trim()
  if (!raw) return null
  const parsed = Number.parseFloat(raw.replace(",", "."))
  return Number.isNaN(parsed) ? null : parsed
}

const toCents = (value: string): number | null => {
  const parsed = parseNumericInput(value)
  if (parsed === null) return null
  return Math.round(parsed * 100)
}

const toBasisPoints = (value: string): number | null => {
  const parsed = parseNumericInput(value)
  if (parsed === null) return null
  return Math.round(parsed * 100)
}

const buildPayStateFromComponents = (components: PayComponent[] | undefined): PayState => {
  const state: PayState = {
    hourly: { ...DEFAULT_PAY_STATE.hourly },
    fixed_shift: { ...DEFAULT_PAY_STATE.fixed_shift },
    percent_revenue: { ...DEFAULT_PAY_STATE.percent_revenue },
  }
  for (const component of components ?? []) {
    if (component.componentType === "hourly") {
      state.hourly = {
        isActive: component.isActive,
        value: component.amountCents != null ? String(component.amountCents / 100) : "",
      }
    }
    if (component.componentType === "fixed_shift") {
      state.fixed_shift = {
        isActive: component.isActive,
        value: component.amountCents != null ? String(component.amountCents / 100) : "",
      }
    }
    if (component.componentType === "percent_revenue") {
      state.percent_revenue = {
        isActive: component.isActive,
        value: component.rateBp != null ? String(component.rateBp / 100) : "",
      }
    }
  }
  return state
}

export default function EmployeeProfile({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const { toast } = useToast()
  const employee = useShiftStore((state) => state.employees.find((emp) => emp.id === employeeId))
  const orgPositions = useShiftStore((state) => state.positions)
  const refreshEmployees = useShiftStore((state) => state.refreshEmployees)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteAction, setDeleteAction] = useState<"archive" | "delete" | null>(null)
  const [isEditingPay, setIsEditingPay] = useState(false)
  const [isLoadingPay, setIsLoadingPay] = useState(false)
  const [isSavingPay, setIsSavingPay] = useState(false)
  const [payState, setPayState] = useState<PayState>(() => buildPayStateFromComponents(employee?.payComponents))
  const [isEditingPositions, setIsEditingPositions] = useState(false)
  const [isSavingPositions, setIsSavingPositions] = useState(false)
  const [editedPositions, setEditedPositions] = useState<EmployeePosition[]>(() =>
    (employee?.positions ?? []).map((pos) => ({ id: pos.id, name: pos.name })),
  )
  const [positionPickerValue, setPositionPickerValue] = useState<string>("")
  const joinedAt = employee?.createdAt ? new Date(employee.createdAt) : null
  const joinedAtLabel =
    joinedAt && !Number.isNaN(joinedAt.getTime()) ? format(joinedAt, "d MMMM yyyy", { locale: ru }) : null

  useEffect(() => {
    if (!employee) return
    setPayState(buildPayStateFromComponents(employee.payComponents))
  }, [employee?.id])

  useEffect(() => {
    if (!employee || isEditingPositions) return
    setEditedPositions((employee.positions ?? []).map((pos) => ({ id: pos.id, name: pos.name })))
  }, [employee?.id, employee?.positions, isEditingPositions])

  useEffect(() => {
    if (!employee) return
    const loadPayComponents = async () => {
      setIsLoadingPay(true)
      try {
        const res = await fetch(`/api/employees/${employee.id}/pay-components`, { credentials: "include" })
        if (!res.ok) {
          setIsLoadingPay(false)
          return
        }
        const json = await res.json()
        const components = (json?.data ?? []) as PayComponent[]
        setPayState(buildPayStateFromComponents(components))
      } catch {
        toast({ title: "Не удалось загрузить оплату", variant: "destructive" })
      } finally {
        setIsLoadingPay(false)
      }
    }

    void loadPayComponents()
  }, [employee?.id, toast])

  const hasActivePay = useMemo(
    () => Object.values(payState).some((component) => component.isActive),
    [payState],
  )

  const selectedPositionIds = useMemo(
    () => new Set(editedPositions.map((pos) => pos.id)),
    [editedPositions],
  )

  const availablePositions = useMemo(
    () => orgPositions.filter((pos) => !selectedPositionIds.has(pos.id)),
    [orgPositions, selectedPositionIds],
  )

  const displayPositions = useMemo(
    () =>
      isEditingPositions
        ? editedPositions
        : (employee.positions ?? []).map((pos) => ({ id: pos.id, name: pos.name })),
    [employee.positions, editedPositions, isEditingPositions],
  )

  const togglePositionsEdit = () => {
    if (!employee) return
    if (isEditingPositions) {
      setEditedPositions((employee.positions ?? []).map((pos) => ({ id: pos.id, name: pos.name })))
      setIsEditingPositions(false)
      setPositionPickerValue("")
      return
    }
    setIsEditingPositions(true)
  }

  const addPositionById = (positionId: string) => {
    if (!positionId || selectedPositionIds.has(positionId)) {
      return
    }
    const match = orgPositions.find((pos) => pos.id === positionId)
    if (!match) return
    setEditedPositions((prev) => [...prev, { id: match.id, name: match.name }])
    setPositionPickerValue("")
  }

  const removePosition = (positionId: string) => {
    if (editedPositions.length <= 1) {
      toast({ title: "У сотрудника должна быть хотя бы 1 должность", variant: "destructive" })
      return
    }
    setEditedPositions((prev) => prev.filter((pos) => pos.id !== positionId))
  }

  const handleSavePositions = async () => {
    if (!employee) return
    if (editedPositions.length === 0) {
      toast({ title: "Добавьте хотя бы одну должность", variant: "destructive" })
      return
    }
    setIsSavingPositions(true)
    try {
      const res = await fetch(`/api/employees/${employee.id}/positions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ positionIds: editedPositions.map((pos) => pos.id) }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || "Не удалось сохранить должности")
      }
      await refreshEmployees()
      setIsEditingPositions(false)
      setPositionPickerValue("")
      toast({ title: "Должности обновлены" })
    } catch (error: any) {
      toast({ title: error?.message || "Не удалось сохранить должности", variant: "destructive" })
    } finally {
      setIsSavingPositions(false)
    }
  }

  const handleSavePay = async () => {
    if (!employee) return
    const payload = PAY_OPTIONS.map((option) => {
      const state = payState[option.key]
      if (!state.isActive) {
        return { componentType: option.key, isActive: false }
      }
      if (option.key === "percent_revenue") {
        const rateBp = toBasisPoints(state.value)
        return { componentType: option.key, rateBp, isActive: true }
      }
      const amountCents = toCents(state.value)
      return { componentType: option.key, amountCents, isActive: true }
    })

    if (
      payload.some(
        (item) =>
          item.isActive &&
          (("amountCents" in item && item.amountCents == null) || ("rateBp" in item && item.rateBp == null)),
      )
    ) {
      toast({ title: "Заполните значения оплаты", variant: "destructive" })
      return
    }

    setIsSavingPay(true)
    try {
      const res = await fetch(`/api/employees/${employee.id}/pay-components`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ components: payload }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || "Не удалось сохранить оплату")
      }
      const json = await res.json()
      const components = (json?.data ?? []) as PayComponent[]
      setPayState(buildPayStateFromComponents(components))
      setIsEditingPay(false)
      toast({ title: "Оплата обновлена" })
    } catch (error: any) {
      toast({ title: error?.message || "Не удалось сохранить оплату", variant: "destructive" })
    } finally {
      setIsSavingPay(false)
    }
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-background pb-6 max-w-md mx-auto p-4">
        <Card className="p-4 text-center space-y-2">
          <p className="text-sm text-muted-foreground">Сотрудник не найден</p>
          <Button variant="outline" className="w-full h-10 bg-transparent" onClick={onBack}>
            Назад
          </Button>
        </Card>
      </div>
    )
  }

  if (showDeleteModal) {
    return (
      <div className="min-h-screen bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 max-w-md mx-auto">
        <Card className="w-full p-6 space-y-6">
          {deleteAction === null && (
            <>
              <div className="text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <AlertTriangle className="h-6 w-6 text-destructive" strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-bold">Удалить или отключить?</h2>
                <p className="text-sm text-muted-foreground">Выберите безопасное действие</p>
              </div>

              <div className="space-y-2">
                <Card className="p-4 cursor-pointer hover:border-primary/50" onClick={() => setDeleteAction("archive")}>
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Archive className="h-5 w-5 text-primary" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Отключить (архивировать)</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Данные по прошлым сменам и выплатам сохранятся. Можно включить обратно.
                      </p>
                    </div>
                  </div>
                </Card>

                <Card
                  className="p-4 cursor-pointer hover:border-destructive/50"
                  onClick={() => setDeleteAction("delete")}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <Trash2 className="h-5 w-5 text-destructive" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Удалить навсегда</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Доступно только если нет связанных смен и выплат. Действие необратимо.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              <Button
                variant="outline"
                className="w-full h-11 bg-transparent"
                onClick={() => setShowDeleteModal(false)}
              >
                Отмена
              </Button>
            </>
          )}

          {deleteAction === "archive" && (
            <>
              <div className="text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Archive className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-bold">Отключить сотрудника?</h2>
                <p className="text-sm text-muted-foreground">
                  {employee.name} будет перемещён в архив. Все данные сохранятся.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-11 bg-transparent" onClick={() => setDeleteAction(null)}>
                  Назад
                </Button>
                <Button className="flex-1 h-11" onClick={onBack}>
                  Отключить
                </Button>
              </div>
            </>
          )}

          {deleteAction === "delete" && (
            <>
              <div className="text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <Trash2 className="h-6 w-6 text-destructive" strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-bold">Удалить навсегда?</h2>
                <p className="text-sm text-muted-foreground">Это действие нельзя отменить</p>
              </div>

              <Card className="p-3 bg-destructive/5 border-destructive/20">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  У {employee.name} есть 12 смен и 3 активных выплаты. Сначала нужно завершить все связанные операции
                  или выберите "Отключить".
                </p>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-11 bg-transparent" onClick={() => setDeleteAction(null)}>
                  Назад
                </Button>
                <Button variant="destructive" className="flex-1 h-11" disabled>
                  Удалить
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-6 max-w-md mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-lg font-semibold">Профиль сотрудника</h1>
            <div className="h-9 w-9" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
              <User className="h-8 w-8 text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2 className="text-xl font-bold">{employee.name}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={togglePositionsEdit}
                  disabled={isSavingPositions}
                >
                  <Edit className="h-4 w-4 mr-1" strokeWidth={1.5} />
                  {isEditingPositions ? "Отмена" : "Должности"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {displayPositions.length === 0 && (
                  <span className="text-xs text-muted-foreground">Должности не заданы</span>
                )}
                {displayPositions.map((pos) => (
                  <Badge key={pos.id} variant="secondary" className={isEditingPositions ? "pr-1" : undefined}>
                    <span>{pos.name}</span>
                    {isEditingPositions && (
                      <button
                        type="button"
                        className="ml-1 rounded-sm p-0.5 hover:bg-background/60 disabled:opacity-50"
                        onClick={() => removePosition(pos.id)}
                        disabled={editedPositions.length <= 1}
                        aria-label={`Удалить должность ${pos.name}`}
                      >
                        <X className="h-3 w-3" strokeWidth={2} />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
              {isEditingPositions && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex-1 min-w-0">
                      <Select
                        value={positionPickerValue || undefined}
                        onValueChange={(value) => {
                          setPositionPickerValue(value)
                          addPositionById(value)
                        }}
                      >
                        <SelectTrigger className="h-9 w-full max-w-full overflow-hidden">
                          <SelectValue placeholder="Выберете" className="truncate" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePositions.length === 0 ? (
                            <SelectItem value="__none__" disabled>
                              Нет доступных должностей
                            </SelectItem>
                          ) : (
                            availablePositions.map((pos) => (
                              <SelectItem key={pos.id} value={pos.id}>
                                {pos.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-full sm:w-auto sm:flex-shrink-0"
                      onClick={handleSavePositions}
                      disabled={isSavingPositions || editedPositions.length === 0}
                    >
                      {isSavingPositions ? "Сохранение..." : "Сохранить"}
                    </Button>
                  </div>
                  {editedPositions.length === 0 && (
                    <p className="text-xs text-destructive">Нужна минимум одна должность</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {employee.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <span>{employee.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              {employee.email ? <span>{employee.email}</span> : <span className="text-muted-foreground">Не указан</span>}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              {joinedAtLabel ? (
                <span>Работает с {joinedAtLabel}</span>
              ) : (
                <span className="text-muted-foreground">Работает с не указано</span>
              )}
            </div>
          </div>
        </Card>

        {/* Salary Settings */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Оплата</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setIsEditingPay((prev) => !prev)}
              disabled={isLoadingPay || isSavingPay}
            >
              <Edit className="h-4 w-4 mr-1" strokeWidth={1.5} />
              {isEditingPay ? "Отмена" : "Изменить"}
            </Button>
          </div>

          {isLoadingPay ? (
            <p className="text-sm text-muted-foreground">Загрузка оплаты...</p>
          ) : (
            <div className="space-y-3">
              {PAY_OPTIONS.map((option) => {
                const Icon = option.icon
                const state = payState[option.key]
                if (isEditingPay) {
                  return (
                    <div key={option.key} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                        <span className="text-sm">{option.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={state.isActive}
                          onCheckedChange={(checked) =>
                            setPayState((prev) => ({
                              ...prev,
                              [option.key]: { ...prev[option.key], isActive: checked },
                            }))
                          }
                        />
                        <div className="relative w-[120px]">
                          <Input
                            type="number"
                            min={option.key === "percent_revenue" ? 1 : 0}
                            value={state.value}
                            onChange={(event) =>
                              setPayState((prev) => ({
                                ...prev,
                                [option.key]: { ...prev[option.key], value: event.target.value },
                              }))
                            }
                            disabled={!state.isActive}
                            className="h-9 pr-10"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {option.suffix}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={option.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                      <span className="text-sm">{option.label}</span>
                    </div>
                    <span className="font-semibold">
                      {state.isActive && state.value ? `${state.value} ${option.suffix}` : "—"}
                    </span>
                  </div>
                )
              })}
              {!hasActivePay && !isEditingPay && (
                <p className="text-xs text-muted-foreground">Оплата не настроена</p>
              )}
            </div>
          )}

          {isEditingPay && (
            <Button className="w-full h-10" onClick={handleSavePay} disabled={isSavingPay}>
              {isSavingPay ? "Сохранение..." : "Сохранить"}
            </Button>
          )}
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2.5">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Calendar className="h-4 w-4" strokeWidth={1.5} />
              <span className="text-xs uppercase tracking-wide">Смены</span>
            </div>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-muted-foreground mt-1">Нет данных</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
              <span className="text-xs uppercase tracking-wide">Заработано</span>
            </div>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-muted-foreground mt-1">Нет данных</p>
          </Card>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-4">
          <Button
            variant="outline"
            className="w-full h-11 justify-start text-destructive hover:text-destructive bg-transparent"
            onClick={() => setShowDeleteModal(true)}
          >
            <Archive className="h-4 w-4 mr-2" strokeWidth={1.5} />
            Отключить или удалить
          </Button>
        </div>
      </div>
    </div>
  )
}
