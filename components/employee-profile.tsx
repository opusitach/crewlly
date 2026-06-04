"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import { ru, enUS } from "date-fns/locale"
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
import { useAuthStore } from "@/lib/store/auth-store"
import { useShiftStore } from "@/lib/store/shift-store"
import type { PayComponent } from "@/lib/pay-components"
import { formatPhoneForDisplay } from "@/lib/validation/phone"
import { useTranslation } from "@/lib/i18n/context"

type EmployeePosition = { id: string; name: string }

const PAY_OPTION_DEFS = [
  { key: "hourly" as const, labelKey: "pay_hourly" as const, icon: Clock },
  { key: "fixed_shift" as const, labelKey: "pay_fixed_shift" as const, icon: DollarSign },
  { key: "percent_revenue" as const, labelKey: "pay_percent_revenue" as const, icon: Percent },
]

type PayKey = (typeof PAY_OPTION_DEFS)[number]["key"]

type PayState = Record<PayKey, { isActive: boolean; value: string }>

type EarningsSummary = {
  totalSalaryCents: number
  shiftsCount: number
  currency: string | null
}

const DEFAULT_PAY_STATE: PayState = {
  hourly: { isActive: false, value: "" },
  fixed_shift: { isActive: false, value: "" },
  percent_revenue: { isActive: false, value: "" },
}

const DEFAULT_EARNINGS_SUMMARY: EarningsSummary = {
  totalSalaryCents: 0,
  shiftsCount: 0,
  currency: "CZK",
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

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const formatMoney = (valueCents: number, currency: string | null | undefined) => {
  const safeCurrency = currency || "CZK"
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 0,
    }).format(valueCents / 100)
  } catch {
    return `${Math.round(valueCents / 100)} ${safeCurrency}`
  }
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
  const { t, language } = useTranslation()
  const authUser = useAuthStore((state) => state.user)
  const authAccessRole = useAuthStore((state) => state.accessRole)
  const authLegacyRole = useAuthStore((state) => state.legacyRole)
  const employee = useShiftStore((state) => state.employees.find((emp) => emp.id === employeeId))
  const orgPositions = useShiftStore((state) => state.positions)
  const refreshEmployees = useShiftStore((state) => state.refreshEmployees)
  const updateEmployee = useShiftStore((state) => state.updateEmployee)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteAction, setDeleteAction] = useState<"archive" | "delete" | null>(null)
  const [isEditingPay, setIsEditingPay] = useState(false)
  const [isLoadingPay, setIsLoadingPay] = useState(false)
  const [isSavingPay, setIsSavingPay] = useState(false)
  const [payState, setPayState] = useState<PayState>(() => buildPayStateFromComponents(employee?.payComponents))
  const [earningsSummary, setEarningsSummary] = useState<EarningsSummary>(DEFAULT_EARNINGS_SUMMARY)
  const [isLoadingEarnings, setIsLoadingEarnings] = useState(false)
  const [earningsError, setEarningsError] = useState<string | null>(null)
  const [isEditingPositions, setIsEditingPositions] = useState(false)
  const [isSavingPositions, setIsSavingPositions] = useState(false)
  const [isPromotingManager, setIsPromotingManager] = useState(false)
  const earningsRequestIdRef = useRef(0)
  const [editedPositions, setEditedPositions] = useState<EmployeePosition[]>(() =>
    (employee?.positions ?? []).map((pos) => ({ id: pos.id, name: pos.name })),
  )
  const [positionPickerValue, setPositionPickerValue] = useState<string>("")
  const dateLocale = language === "en" ? enUS : ru
  const joinedAt = employee?.createdAt ? new Date(employee.createdAt) : null
  const joinedAtLabel =
    joinedAt && !Number.isNaN(joinedAt.getTime()) ? format(joinedAt, "d MMMM yyyy", { locale: dateLocale }) : null
  const currentViewerRoleKey = authAccessRole?.key ?? authLegacyRole ?? authUser?.primaryMode ?? null
  const employeeRoleKey = employee?.accessRoleKey ?? "worker"
  const employeeRoleLabel =
    employeeRoleKey === "owner"
      ? t("role_owner")
      : employeeRoleKey === "manager"
        ? t("role_manager")
        : t("role_worker")
  const canPromoteManager =
    currentViewerRoleKey === "owner" && employeeRoleKey !== "manager" && employeeRoleKey !== "owner"
  const currentMonthRange = useMemo(() => {
    const today = new Date()
    return {
      fromDate: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
      toDate: toDateInputValue(today),
    }
  }, [])

  const paySuffixes: Record<PayKey, string> = useMemo(
    () => ({
      hourly: `CZK/${language === "en" ? "h" : "ч"}`,
      fixed_shift: "CZK",
      percent_revenue: "%",
    }),
    [language],
  )

  useEffect(() => {
    if (!employee) return
    setPayState(buildPayStateFromComponents(employee.payComponents))
  }, [employee?.id, employee?.payComponents])

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
        updateEmployee(employee.id, { payComponents: components })
      } catch {
        toast({ title: t("employee_profile_load_pay_error"), variant: "destructive" })
      } finally {
        setIsLoadingPay(false)
      }
    }

    void loadPayComponents()
  }, [employee?.id, toast, updateEmployee])

  const loadEarningsSummary = async (targetEmployeeId: string) => {
    const requestId = earningsRequestIdRef.current + 1
    earningsRequestIdRef.current = requestId
    setIsLoadingEarnings(true)
    setEarningsError(null)
    try {
      const params = new URLSearchParams({
        dateFrom: currentMonthRange.fromDate,
        dateTo: currentMonthRange.toDate,
      })
      const res = await fetch(`/api/employees/${targetEmployeeId}/earnings?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      })
      if (!res.ok) {
        throw new Error(t("employee_profile_salary_desc"))
      }
      const json = await res.json()
      const rawSummary = json?.data?.summary ?? {}
      if (earningsRequestIdRef.current !== requestId) return
      setEarningsSummary({
        totalSalaryCents: Number.isInteger(rawSummary.totalSalaryCents) ? Number(rawSummary.totalSalaryCents) : 0,
        shiftsCount: Number.isInteger(rawSummary.shiftsCount) ? Number(rawSummary.shiftsCount) : 0,
        currency: typeof rawSummary.currency === "string" ? rawSummary.currency : "CZK",
      })
    } catch {
      if (earningsRequestIdRef.current !== requestId) return
      setEarningsSummary(DEFAULT_EARNINGS_SUMMARY)
      setEarningsError(t("employee_profile_load_pay_error"))
    } finally {
      if (earningsRequestIdRef.current !== requestId) return
      setIsLoadingEarnings(false)
    }
  }

  useEffect(() => {
    if (!employee) return
    void loadEarningsSummary(employee.id)
  }, [employee?.id, currentMonthRange.fromDate, currentMonthRange.toDate])

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
        : (employee?.positions ?? []).map((pos) => ({ id: pos.id, name: pos.name })),
    [employee?.positions, editedPositions, isEditingPositions],
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
      toast({ title: t("employee_profile_min_position_toast"), variant: "destructive" })
      return
    }
    setEditedPositions((prev) => prev.filter((pos) => pos.id !== positionId))
  }

  const handleSavePositions = async () => {
    if (!employee) return
    if (editedPositions.length === 0) {
      toast({ title: t("employee_profile_add_position_toast"), variant: "destructive" })
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
        throw new Error(json?.error || t("employee_profile_save_positions_error"))
      }
      await refreshEmployees()
      setIsEditingPositions(false)
      setPositionPickerValue("")
      toast({ title: t("employee_profile_positions_updated") })
    } catch (error: any) {
      toast({ title: error?.message || t("employee_profile_save_positions_error"), variant: "destructive" })
    } finally {
      setIsSavingPositions(false)
    }
  }

  const handleSavePay = async () => {
    if (!employee) return
    const previousPayComponents = employee.payComponents
    const payload = PAY_OPTION_DEFS.map((option) => {
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
    const optimisticPayComponents: PayComponent[] = payload.map((item) => ({
      componentType: item.componentType,
      amountCents: "amountCents" in item ? item.amountCents ?? null : null,
      rateBp: "rateBp" in item ? item.rateBp ?? null : null,
      isActive: item.isActive ?? false,
      priority: 0,
    }))

    if (
      payload.some(
        (item) =>
          item.isActive &&
          (("amountCents" in item && item.amountCents == null) || ("rateBp" in item && item.rateBp == null)),
      )
    ) {
      toast({ title: t("employee_profile_fill_pay_values"), variant: "destructive" })
      return
    }

    setIsSavingPay(true)
    updateEmployee(employee.id, { payComponents: optimisticPayComponents })
    try {
      const res = await fetch(`/api/employees/${employee.id}/pay-components`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ components: payload }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || t("employee_profile_save_pay_error"))
      }
      const json = await res.json()
      const components = (json?.data ?? []) as PayComponent[]
      setPayState(buildPayStateFromComponents(components))
      updateEmployee(employee.id, { payComponents: components })
      await loadEarningsSummary(employee.id)
      setIsEditingPay(false)
      toast({ title: t("employee_profile_pay_updated") })
    } catch (error: any) {
      updateEmployee(employee.id, { payComponents: previousPayComponents })
      toast({ title: error?.message || t("employee_profile_save_pay_error"), variant: "destructive" })
    } finally {
      setIsSavingPay(false)
    }
  }

  const handlePromoteToManager = async () => {
    if (!employee || !canPromoteManager || isPromotingManager) return

    setIsPromotingManager(true)
    try {
      const res = await fetch(`/api/employees/${employee.id}/manager`, {
        method: "PUT",
        credentials: "include",
      })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.error || t("employee_profile_promote_manager_error"))
      }

      await refreshEmployees()
      toast({ title: t("employee_profile_promoted_manager", { name: employee.name }) })
    } catch (error: any) {
      toast({ title: error?.message || t("employee_profile_promote_manager_error"), variant: "destructive" })
    } finally {
      setIsPromotingManager(false)
    }
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-background pb-6 max-w-md mx-auto p-4">
        <Card className="p-4 text-center space-y-2">
          <p className="text-sm text-muted-foreground">{t("employee_profile_not_found")}</p>
          <Button variant="outline" className="w-full h-10 bg-transparent" onClick={onBack}>
            {t("common_back")}
          </Button>
        </Card>
      </div>
    )
  }

  if (showDeleteModal) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 max-w-md mx-auto">
        <Card className="w-full p-6 space-y-6">
          {deleteAction === null && (
            <>
              <div className="text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <AlertTriangle className="h-6 w-6 text-destructive" strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-bold">{t("employee_profile_delete_or_disable")}</h2>
                <p className="text-sm text-muted-foreground">{t("employee_profile_choose_action")}</p>
              </div>

              <div className="space-y-2">
                <Card className="p-4 cursor-pointer hover:border-primary/50" onClick={() => setDeleteAction("archive")}>
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Archive className="h-5 w-5 text-primary" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{t("employee_profile_disable")}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("employee_profile_disable_desc")}
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
                      <h3 className="font-semibold mb-1">{t("employee_profile_delete_forever")}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("employee_profile_delete_forever_desc")}
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
                {t("common_cancel")}
              </Button>
            </>
          )}

          {deleteAction === "archive" && (
            <>
              <div className="text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Archive className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-bold">{t("employee_profile_disable_confirm_title")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("employee_profile_disable_confirm_desc", { name: employee.name })}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-11 bg-transparent" onClick={() => setDeleteAction(null)}>
                  {t("common_back")}
                </Button>
                <Button className="flex-1 h-11" onClick={onBack}>
                  {t("employee_profile_disable_action")}
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
                <h2 className="text-xl font-bold">{t("employee_profile_delete_forever_confirm")}</h2>
                <p className="text-sm text-muted-foreground">{t("employee_profile_delete_irreversible")}</p>
              </div>

              <Card className="p-3 bg-destructive/5 border-destructive/20">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("employee_profile_delete_has_data", { name: employee.name })}
                </p>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-11 bg-transparent" onClick={() => setDeleteAction(null)}>
                  {t("common_back")}
                </Button>
                <Button variant="destructive" className="flex-1 h-11" disabled>
                  {t("employee_profile_delete_action")}
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
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold">{t("employee_profile_title")}</h1>
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
                <div className="min-w-0">
                  <h2 className="text-xl font-bold truncate">{employee.name}</h2>
                  <div className="mt-1">
                    <Badge variant={employeeRoleKey === "manager" ? "default" : "secondary"} className="text-[11px]">
                      {employeeRoleLabel}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={togglePositionsEdit}
                  disabled={isSavingPositions}
                >
                  <Edit className="h-4 w-4 mr-1" strokeWidth={1.5} />
                  {isEditingPositions ? t("common_cancel") : t("employee_profile_positions")}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {displayPositions.length === 0 && (
                  <span className="text-xs text-muted-foreground">{t("employee_profile_no_positions_set")}</span>
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
                        aria-label={`${t("employee_profile_remove_position")} ${pos.name}`}
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
                          <SelectValue placeholder={t("employee_profile_select_position")} className="truncate" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePositions.length === 0 ? (
                            <SelectItem value="__none__" disabled>
                              {t("employee_profile_no_positions")}
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
                      {isSavingPositions ? t("employee_profile_saving") : t("common_save")}
                    </Button>
                  </div>
                  {editedPositions.length === 0 && (
                    <p className="text-xs text-destructive">{t("employee_profile_min_one_position")}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {employee.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <span>{formatPhoneForDisplay(employee.phone)}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              {employee.email ? (
                <span>{employee.email}</span>
              ) : (
                <span className="text-muted-foreground">{t("common_not_specified")}</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              {joinedAtLabel ? (
                <span>{t("employee_profile_works_since", { date: joinedAtLabel })}</span>
              ) : (
                <span className="text-muted-foreground">{t("employee_profile_works_since_unknown")}</span>
              )}
            </div>
          </div>

          <div className="pt-4">
            {employeeRoleKey === "manager" ? (
              <Button variant="secondary" className="w-full h-10" disabled>
                {t("employee_profile_manager_assigned")}
              </Button>
            ) : canPromoteManager ? (
              <Button className="w-full h-10" onClick={handlePromoteToManager} disabled={isPromotingManager}>
                {isPromotingManager ? t("employee_profile_promoting") : t("employee_profile_promote_manager")}
              </Button>
            ) : null}
          </div>
        </Card>

        {/* Salary Settings */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("employee_profile_pay")}</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setIsEditingPay((prev) => !prev)}
              disabled={isLoadingPay || isSavingPay}
            >
              <Edit className="h-4 w-4 mr-1" strokeWidth={1.5} />
              {isEditingPay ? t("common_cancel") : t("common_edit")}
            </Button>
          </div>

          {isLoadingPay ? (
            <p className="text-sm text-muted-foreground">{t("employee_profile_loading_pay")}</p>
          ) : (
            <div className="space-y-3">
              {PAY_OPTION_DEFS.map((option) => {
                const Icon = option.icon
                const state = payState[option.key]
                const suffix = paySuffixes[option.key]
                if (isEditingPay) {
                  return (
                    <div key={option.key} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                        <span className="text-sm">{t(option.labelKey)}</span>
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
                            {suffix}
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
                      <span className="text-sm">{t(option.labelKey)}</span>
                    </div>
                    <span className="font-semibold">
                      {state.isActive && state.value ? `${state.value} ${suffix}` : "—"}
                    </span>
                  </div>
                )
              })}
              {!hasActivePay && !isEditingPay && (
                <p className="text-xs text-muted-foreground">{t("employee_profile_pay_not_configured")}</p>
              )}
            </div>
          )}

          {isEditingPay && (
            <Button className="w-full h-10" onClick={handleSavePay} disabled={isSavingPay}>
              {isSavingPay ? t("employee_profile_saving") : t("common_save")}
            </Button>
          )}
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2.5">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Calendar className="h-4 w-4" strokeWidth={1.5} />
              <span className="text-xs uppercase tracking-wide">{t("employee_profile_shifts")}</span>
            </div>
            <p className="text-2xl font-bold">{isLoadingEarnings ? "—" : earningsSummary.shiftsCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {earningsError ? earningsError : t("employee_profile_this_month")}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
              <span className="text-xs uppercase tracking-wide">{t("employee_profile_salary")}</span>
            </div>
            <p className="text-2xl font-bold">
              {isLoadingEarnings ? "—" : formatMoney(earningsSummary.totalSalaryCents, earningsSummary.currency)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {earningsError ? earningsError : t("employee_profile_salary_desc")}
            </p>
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
            {t("employee_profile_disable_or_delete")}
          </Button>
        </div>
      </div>
    </div>
  )
}
