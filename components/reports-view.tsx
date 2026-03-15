"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { TrendingUp, Users, DollarSign, Calendar, Calculator, Loader2, ChevronRight } from "lucide-react"
import EmployeeMoneyView from "@/components/employee-money-view"
import ReportCashFieldView from "@/components/report-cash-field-view"
import ReportCashFormulaView from "@/components/report-cash-formula-view"

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/

const isDateInputValue = (value: string | null | undefined): value is string =>
  typeof value === "string" && dateInputPattern.test(value)

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

const formatCashValue = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)
}

type ReportEmployee = {
  id: string
  fullName: string
}

type EmployeeEarningsSummary = {
  totalSalaryCents: number
  totalTipsCents: number
  totalBonusCents: number
  totalPenaltyCents: number
  totalAdjustmentsCents: number
  totalAccruedCents: number
  totalMinutesWorked: number
  shiftsCount: number
  currency: string | null
}

type CashFieldSummaryItem = {
  fieldKey: string
  fieldLabel: string
  inputStage: "open" | "close"
  totalValueCents: number
  entriesCount: number
  isRevenueBasis: boolean
}

type FormulaSummaryItem = {
  resultKey: string
  resultLabel: string
  totalValueCents: number
  entriesCount: number
  isTipsSource: boolean
  displayOrder: number
}

type CashSummary = {
  currency: string | null
  sessionsCount: number
  evaluatedFormulaSessions: number
  cashFields: CashFieldSummaryItem[]
  formulas: FormulaSummaryItem[]
  formulaWarnings: string[]
  formulaErrors: number
}

type SelectedCashField = {
  fieldKey: string
  fieldLabel: string
  inputStage: "open" | "close"
}

type SelectedFormula = {
  resultKey: string
  resultLabel: string
}

const EMPTY_EMPLOYEE_SUMMARY: EmployeeEarningsSummary = {
  totalSalaryCents: 0,
  totalTipsCents: 0,
  totalBonusCents: 0,
  totalPenaltyCents: 0,
  totalAdjustmentsCents: 0,
  totalAccruedCents: 0,
  totalMinutesWorked: 0,
  shiftsCount: 0,
  currency: "CZK",
}

const EMPTY_CASH_SUMMARY: CashSummary = {
  currency: "CZK",
  sessionsCount: 0,
  evaluatedFormulaSessions: 0,
  cashFields: [],
  formulas: [],
  formulaWarnings: [],
  formulaErrors: 0,
}

const normalizeCashFieldSummaryItems = (raw: unknown): CashFieldSummaryItem[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const inputStage = row.inputStage === "open" || row.inputStage === "close" ? row.inputStage : null
      const fieldKey = typeof row.fieldKey === "string" ? row.fieldKey : ""
      if (!inputStage || !fieldKey) return null
      return {
        fieldKey,
        fieldLabel: typeof row.fieldLabel === "string" ? row.fieldLabel : fieldKey,
        inputStage,
        totalValueCents: Number.isInteger(row.totalValueCents) ? Number(row.totalValueCents) : 0,
        entriesCount: Number.isInteger(row.entriesCount) ? Number(row.entriesCount) : 0,
        isRevenueBasis: row.isRevenueBasis === true,
      } satisfies CashFieldSummaryItem
    })
    .filter((item): item is CashFieldSummaryItem => item !== null)
    .sort((a, b) => {
      if (a.inputStage !== b.inputStage) return a.inputStage === "open" ? -1 : 1
      return a.fieldLabel.localeCompare(b.fieldLabel)
    })
}

const normalizeFormulaSummaryItems = (raw: unknown): FormulaSummaryItem[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const resultKey = typeof row.resultKey === "string" ? row.resultKey : ""
      const resultLabel = typeof row.resultLabel === "string" ? row.resultLabel : ""
      if (!resultKey || !resultLabel) return null
      return {
        resultKey,
        resultLabel,
        totalValueCents: Number.isInteger(row.totalValueCents) ? Number(row.totalValueCents) : 0,
        entriesCount: Number.isInteger(row.entriesCount) ? Number(row.entriesCount) : 0,
        isTipsSource: row.isTipsSource === true,
        displayOrder: Number.isInteger(row.displayOrder) ? Number(row.displayOrder) : index,
      } satisfies FormulaSummaryItem
    })
    .filter((item): item is FormulaSummaryItem => item !== null)
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.resultLabel.localeCompare(b.resultLabel)
    })
}

type ReportsViewProps = {
  initialFromDate?: string
  initialToDate?: string
  initialSelectedEmployeeId?: string | null
  initialEmployeeFromDate?: string
  initialEmployeeToDate?: string
  onInitialEmployeeNavigationHandled?: () => void
  onEmployeeEarningSelect?: (target: {
    intervalId: string
    workDate: string
    employeeId: string
    fromDate: string
    toDate: string
  }) => void
}

export default function ReportsView({
  initialFromDate,
  initialToDate,
  initialSelectedEmployeeId,
  initialEmployeeFromDate,
  initialEmployeeToDate,
  onInitialEmployeeNavigationHandled,
  onEmployeeEarningSelect,
}: ReportsViewProps = {}) {
  const today = useMemo(() => new Date(), [])
  const defaultFrom = useMemo(() => toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)), [today])
  const defaultTo = useMemo(() => toDateInputValue(today), [today])
  const initialRange = useMemo(() => {
    const fromDate = isDateInputValue(initialFromDate) ? initialFromDate : defaultFrom
    const toDate = isDateInputValue(initialToDate) ? initialToDate : defaultTo
    if (fromDate && toDate && toDate < fromDate) {
      return { fromDate: defaultFrom, toDate: defaultTo }
    }
    return { fromDate, toDate }
  }, [defaultFrom, defaultTo, initialFromDate, initialToDate])

  const [fromDate, setFromDate] = useState(initialRange.fromDate)
  const [toDate, setToDate] = useState(initialRange.toDate)
  const [appliedRange, setAppliedRange] = useState(initialRange)
  const [employees, setEmployees] = useState<ReportEmployee[]>([])
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true)
  const [employeeLoadError, setEmployeeLoadError] = useState<string | null>(null)
  const [employeeSummaries, setEmployeeSummaries] = useState<Record<string, EmployeeEarningsSummary>>({})
  const [isEmployeeSummariesLoading, setIsEmployeeSummariesLoading] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [selectedEmployeeInitialRange, setSelectedEmployeeInitialRange] = useState<{
    fromDate?: string
    toDate?: string
  } | null>(null)
  const [selectedCashField, setSelectedCashField] = useState<SelectedCashField | null>(null)
  const [selectedFormula, setSelectedFormula] = useState<SelectedFormula | null>(null)
  const [cashSummary, setCashSummary] = useState<CashSummary>(EMPTY_CASH_SUMMARY)
  const [isCashSummaryLoading, setIsCashSummaryLoading] = useState(false)
  const [cashSummaryError, setCashSummaryError] = useState<string | null>(null)

  useEffect(() => {
    setFromDate((prev) => (prev === initialRange.fromDate ? prev : initialRange.fromDate))
    setToDate((prev) => (prev === initialRange.toDate ? prev : initialRange.toDate))
    setAppliedRange((prev) =>
      prev.fromDate === initialRange.fromDate && prev.toDate === initialRange.toDate ? prev : initialRange,
    )
  }, [initialRange.fromDate, initialRange.toDate])

  useEffect(() => {
    if (!initialSelectedEmployeeId) return
    setSelectedEmployeeId((prev) => (prev === initialSelectedEmployeeId ? prev : initialSelectedEmployeeId))
    setSelectedEmployeeInitialRange({
      fromDate: initialEmployeeFromDate,
      toDate: initialEmployeeToDate,
    })
    onInitialEmployeeNavigationHandled?.()
  }, [
    initialEmployeeFromDate,
    initialEmployeeToDate,
    initialSelectedEmployeeId,
    onInitialEmployeeNavigationHandled,
  ])

  useEffect(() => {
    let active = true

    const loadCashSummary = async () => {
      setIsCashSummaryLoading(true)
      setCashSummaryError(null)
      try {
        const params = new URLSearchParams()
        if (appliedRange.fromDate) params.set("dateFrom", appliedRange.fromDate)
        if (appliedRange.toDate) params.set("dateTo", appliedRange.toDate)

        const response = await fetch(`/api/reports/cash-summary?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        })
        const json = (await response.json().catch(() => null)) as
          | {
              data?: { summary?: unknown }
              error?: string
            }
          | null

        if (!response.ok) {
          throw new Error(json?.error || "Не удалось загрузить кассовые данные")
        }

        const rawSummary = (json?.data?.summary ?? {}) as Record<string, unknown>
        const nextSummary: CashSummary = {
          currency: typeof rawSummary.currency === "string" ? rawSummary.currency : "CZK",
          sessionsCount: Number.isInteger(rawSummary.sessionsCount) ? Number(rawSummary.sessionsCount) : 0,
          evaluatedFormulaSessions: Number.isInteger(rawSummary.evaluatedFormulaSessions)
            ? Number(rawSummary.evaluatedFormulaSessions)
            : 0,
          cashFields: normalizeCashFieldSummaryItems(rawSummary.cashFields),
          formulas: normalizeFormulaSummaryItems(rawSummary.formulas),
          formulaWarnings: Array.isArray(rawSummary.formulaWarnings)
            ? rawSummary.formulaWarnings.filter((item): item is string => typeof item === "string")
            : [],
          formulaErrors: Number.isInteger(rawSummary.formulaErrors) ? Number(rawSummary.formulaErrors) : 0,
        }

        if (!active) return
        setCashSummary(nextSummary)
      } catch (error) {
        if (!active) return
        setCashSummary(EMPTY_CASH_SUMMARY)
        setCashSummaryError(error instanceof Error ? error.message : "Не удалось загрузить кассовые данные")
      } finally {
        if (active) setIsCashSummaryLoading(false)
      }
    }

    void loadCashSummary()
    return () => {
      active = false
    }
  }, [appliedRange.fromDate, appliedRange.toDate])

  useEffect(() => {
    let active = true

    const loadEmployees = async () => {
      setIsEmployeesLoading(true)
      setEmployeeLoadError(null)
      try {
        const response = await fetch("/api/employees", { credentials: "include", cache: "no-store" })
        const json = (await response.json().catch(() => null)) as
          | {
              data?: Array<{ id?: string; fullName?: string | null; name?: string | null; employmentStatus?: string }>
              error?: string
            }
          | null

        if (!response.ok) {
          throw new Error(json?.error || "Не удалось загрузить сотрудников")
        }

        const rawEmployees = Array.isArray(json?.data) ? json.data : []
        const activeEmployees = rawEmployees
          .filter((employee) => employee.employmentStatus === "active")
          .map((employee) => ({
            id: employee.id ?? "",
            fullName: employee.fullName?.trim() || employee.name?.trim() || "Сотрудник",
          }))
          .filter((employee) => employee.id)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))

        if (!active) return
        setEmployees(activeEmployees)
      } catch (error) {
        if (!active) return
        setEmployees([])
        setEmployeeLoadError(error instanceof Error ? error.message : "Не удалось загрузить сотрудников")
      } finally {
        if (active) setIsEmployeesLoading(false)
      }
    }

    void loadEmployees()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (employees.length === 0) {
      setEmployeeSummaries({})
      setIsEmployeeSummariesLoading(false)
      return
    }

    let active = true
    const loadSummaries = async () => {
      setIsEmployeeSummariesLoading(true)
      setEmployeeSummaries({})
      const params = new URLSearchParams()
      if (appliedRange.fromDate) params.set("dateFrom", appliedRange.fromDate)
      if (appliedRange.toDate) params.set("dateTo", appliedRange.toDate)

      const entries = await Promise.all(
        employees.map(async (employee) => {
          try {
            const response = await fetch(`/api/employees/${employee.id}/earnings?${params.toString()}`, {
              credentials: "include",
              cache: "no-store",
            })
            if (!response.ok) return [employee.id, EMPTY_EMPLOYEE_SUMMARY] as const
            const json = (await response.json().catch(() => null)) as { data?: { summary?: unknown } } | null
            const rawSummary = (json?.data?.summary ?? {}) as Record<string, unknown>

            return [
              employee.id,
              {
                totalSalaryCents: Number.isInteger(rawSummary.totalSalaryCents) ? Number(rawSummary.totalSalaryCents) : 0,
                totalTipsCents: Number.isInteger(rawSummary.totalTipsCents) ? Number(rawSummary.totalTipsCents) : 0,
                totalBonusCents: Number.isInteger(rawSummary.totalBonusCents) ? Number(rawSummary.totalBonusCents) : 0,
                totalPenaltyCents: Number.isInteger(rawSummary.totalPenaltyCents) ? Number(rawSummary.totalPenaltyCents) : 0,
                totalAdjustmentsCents: Number.isInteger(rawSummary.totalAdjustmentsCents)
                  ? Number(rawSummary.totalAdjustmentsCents)
                  : (Number.isInteger(rawSummary.totalBonusCents) ? Number(rawSummary.totalBonusCents) : 0) -
                    (Number.isInteger(rawSummary.totalPenaltyCents) ? Number(rawSummary.totalPenaltyCents) : 0),
                totalAccruedCents: Number.isInteger(rawSummary.totalAccruedCents)
                  ? Number(rawSummary.totalAccruedCents)
                  : (Number.isInteger(rawSummary.totalSalaryCents) ? Number(rawSummary.totalSalaryCents) : 0) +
                    (Number.isInteger(rawSummary.totalTipsCents) ? Number(rawSummary.totalTipsCents) : 0),
                totalMinutesWorked: Number.isInteger(rawSummary.totalMinutesWorked)
                  ? Number(rawSummary.totalMinutesWorked)
                  : 0,
                shiftsCount: Number.isInteger(rawSummary.shiftsCount) ? Number(rawSummary.shiftsCount) : 0,
                currency: typeof rawSummary.currency === "string" ? rawSummary.currency : "CZK",
              } satisfies EmployeeEarningsSummary,
            ] as const
          } catch {
            return [employee.id, EMPTY_EMPLOYEE_SUMMARY] as const
          }
        }),
      )

      if (!active) return
      setEmployeeSummaries(Object.fromEntries(entries))
      setIsEmployeeSummariesLoading(false)
    }

    void loadSummaries()
    return () => {
      active = false
    }
  }, [appliedRange.fromDate, appliedRange.toDate, employees])

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  )

  if (selectedEmployee) {
    return (
      <EmployeeMoneyView
        onBack={() => {
          setSelectedEmployeeId(null)
          setSelectedEmployeeInitialRange(null)
        }}
        employeeId={selectedEmployee.id}
        employeeName={selectedEmployee.fullName}
        initialFromDate={selectedEmployeeInitialRange?.fromDate}
        initialToDate={selectedEmployeeInitialRange?.toDate}
        onHistoryItemSelect={onEmployeeEarningSelect}
      />
    )
  }

  if (selectedCashField) {
    return (
      <ReportCashFieldView
        onBack={() => setSelectedCashField(null)}
        fieldKey={selectedCashField.fieldKey}
        fieldLabel={selectedCashField.fieldLabel}
        inputStage={selectedCashField.inputStage}
        initialFromDate={appliedRange.fromDate}
        initialToDate={appliedRange.toDate}
      />
    )
  }

  if (selectedFormula) {
    return (
      <ReportCashFormulaView
        onBack={() => setSelectedFormula(null)}
        resultKey={selectedFormula.resultKey}
        resultLabel={selectedFormula.resultLabel}
        initialFromDate={appliedRange.fromDate}
        initialToDate={appliedRange.toDate}
      />
    )
  }

  const isEmpty = false // Change to true to test empty state

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="w-10" />
            <h1 className="text-xl font-semibold">Отчёты</h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4" strokeWidth={1.5} />
            Период
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>
          <Button
            className="w-full"
            onClick={() => setAppliedRange({ fromDate, toDate })}
            disabled={Boolean(fromDate && toDate && toDate < fromDate)}
          >
            Применить период
          </Button>
          {fromDate && toDate && toDate < fromDate && (
            <p className="text-xs text-destructive">Конечная дата должна быть не раньше начальной</p>
          )}
        </Card>

        {isEmpty ? (
          <Card className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-3">
              <TrendingUp className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-base mb-1">Нет данных за период</h3>
            <p className="text-sm text-muted-foreground">Попробуйте выбрать другой период или проверьте смены</p>
            <Button
              variant="outline"
              onClick={() => setAppliedRange({ fromDate: defaultFrom, toDate: defaultTo })}
              className="mt-4"
            >
              Изменить период
            </Button>
          </Card>
        ) : (
          <>
            <div className="space-y-2.5">
              <h2 className="text-base font-semibold">Заведение</h2>
              <div className="grid gap-2.5">
                <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-primary" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Кассовые данные</p>
                      <p className="text-xs text-muted-foreground">
                        {cashSummary.sessionsCount > 0
                          ? `${cashSummary.sessionsCount} кассовых смен за период`
                          : "Кассовые смены за период не найдены"}
                      </p>
                    </div>
                  </div>
                </div>

                {isCashSummaryLoading ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                      Загружаем кассовые данные...
                    </div>
                  </div>
                ) : cashSummaryError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {cashSummaryError}
                  </div>
                ) : cashSummary.cashFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">За выбранный период нет заполненных полей кассы.</p>
                ) : (
                  <div className="space-y-2">
                    {cashSummary.cashFields.map((item) => (
                      <button
                        key={`${item.inputStage}:${item.fieldKey}`}
                        type="button"
                        className="w-full rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                        onClick={() =>
                          setSelectedCashField({
                            fieldKey: item.fieldKey,
                            fieldLabel: item.fieldLabel,
                            inputStage: item.inputStage,
                          })
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {item.fieldLabel}
                              {item.isRevenueBasis && (
                                <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                                  Выручка
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.inputStage === "open" ? "Открытие" : "Закрытие"} • {item.entriesCount} значений
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm whitespace-nowrap">
                              {formatCashValue(item.totalValueCents)}
                            </p>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                </Card>

                <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-secondary flex items-center justify-center">
                      <Calculator className="h-5 w-5 text-primary" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Расчет формул</p>
                      <p className="text-xs text-muted-foreground">
                        {cashSummary.evaluatedFormulaSessions > 0
                          ? `${cashSummary.evaluatedFormulaSessions} смен рассчитано`
                          : "Нет данных для расчета формул"}
                      </p>
                    </div>
                  </div>
                </div>

                {isCashSummaryLoading ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                      Выполняем расчет формул...
                    </div>
                  </div>
                ) : cashSummaryError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {cashSummaryError}
                  </div>
                ) : (
                  <>
                    {cashSummary.formulaWarnings.length > 0 && (
                      <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {cashSummary.formulaWarnings[0]}
                      </div>
                    )}
                    {cashSummary.formulaErrors > 0 && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        Ошибок расчета формул: {cashSummary.formulaErrors}
                      </div>
                    )}
                    {cashSummary.formulas.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Формулы кассы не настроены или не рассчитаны.</p>
                    ) : (
                      <div className="space-y-2">
                        {cashSummary.formulas.map((item) => (
                          <button
                            key={`${item.resultKey}:${item.resultLabel}`}
                            type="button"
                            className="w-full rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                            onClick={() =>
                              setSelectedFormula({
                                resultKey: item.resultKey,
                                resultLabel: item.resultLabel,
                              })
                            }
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {item.resultLabel}
                                  {item.isTipsSource && (
                                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                                      Чаевые
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-muted-foreground">{item.entriesCount} значений</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm whitespace-nowrap">
                                  {formatCashValue(item.totalValueCents)}
                                </p>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                </Card>
              </div>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-base font-semibold">Сотрудники</h2>
              {isEmployeesLoading ? (
                <Card className="p-4 text-sm text-muted-foreground">Загрузка сотрудников...</Card>
              ) : employeeLoadError ? (
                <Card className="p-4 border-destructive/30 bg-destructive/5 text-sm text-destructive">
                  {employeeLoadError}
                </Card>
              ) : employees.length === 0 ? (
                <Card className="p-4 text-sm text-muted-foreground">Нет активных сотрудников</Card>
              ) : (
                <Card className="divide-y divide-border">
                  {employees.map((employee) => {
                    const summary = employeeSummaries[employee.id] ?? EMPTY_EMPLOYEE_SUMMARY
                    const roundedHours = Math.round(summary.totalMinutesWorked / 60)
                    const hasAdjustments = summary.totalBonusCents > 0 || summary.totalPenaltyCents > 0
                    return (
                      <button
                        key={employee.id}
                        type="button"
                        className="w-full p-3 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
                        onClick={() => {
                          setSelectedEmployeeInitialRange(null)
                          setSelectedEmployeeId(employee.id)
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-5 w-5 text-primary" strokeWidth={1.5} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{employee.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              {isEmployeeSummariesLoading
                                ? "Загрузка данных..."
                                : `${roundedHours} часов • ${summary.shiftsCount} смен`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{formatMoney(summary.totalAccruedCents, summary.currency)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {hasAdjustments
                              ? `${formatMoney(summary.totalSalaryCents, summary.currency)} + ${formatMoney(summary.totalTipsCents, summary.currency)} ${
                                  summary.totalAdjustmentsCents >= 0 ? "+" : ""
                                } ${formatMoney(summary.totalAdjustmentsCents, summary.currency)}`
                              : `${formatMoney(summary.totalSalaryCents, summary.currency)} + ${formatMoney(summary.totalTipsCents, summary.currency)}`}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
