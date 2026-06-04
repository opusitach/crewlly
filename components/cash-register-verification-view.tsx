"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  AlertCircle,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Image as ImageIcon,
  User,
} from "lucide-react"
import ShiftDetailsView from "@/components/shift-details-view"
import CashSessionDetailsView, { type CashSessionDetails } from "@/components/cash-session-details-view"
import { useAuthStore } from "@/lib/store/auth-store"
import { useTranslation } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"
import { resolveIntervalWorkedMinutes } from "@/lib/utils/interval-worked-duration"
import { formatTimeValue } from "@/lib/utils/timezone"
import {
  evaluateCashFormulaExpression,
  extractCashFormulaKeys,
  validateAndCompileCashFormulaSet,
} from "@/lib/cash/formula"

type VerificationShift = {
  id: string
  workdayId: string
  workday: {
    id: string
    workDate: string
    status: string
  }
  employee: {
    id: string
    fullName: string | null
    avatarUrl: string | null
  }
  position: {
    id: string
    name: string
  } | null
  startAt: string
  endAt: string
  openedAt: string | null
  closedAt: string | null
  breakMinutes?: number | null
  calculatedMinutesWorked?: number | null
  timeEntry?: {
    clockInAt?: string | null
    clockOutAt?: string | null
  } | null
  status: string
  calculatedGrossPayCents: number | null
  currency?: string | null
  revenueCents: number | null
}

type IntervalsResponse = {
  data?: VerificationShift[]
  error?: string
}

type CashSessionsResponse = {
  data?: CashSessionDetails[]
  error?: string
}

type CashSettingsResponse = {
  data?: {
    formulas?: unknown
  }
  error?: string
}

type VerificationSummaryResponse = {
  data?: {
    totalOnReview?: number
  }
  error?: string
}

type CashFormulaRow = {
  id: string
  resultKey: string
  resultLabel: string
  expression: string
  isTipsSource: boolean
  displayOrder: number
}

type CashFormulaSummaryItem = {
  resultKey: string
  resultLabel: string
  valueCents: number | null
  isTipsSource: boolean
  displayOrder: number
}

type Props = {
  onBack: () => void
  initialTab?: "work_shifts" | "cash_sessions" | "review_queue"
  initialDate?: string
  initialSelectedShiftId?: string | null
  initialSelectedCashSessionId?: string | null
  initialShiftBackNavigation?: {
    intervalId: string
    employeeId: string
    fromDate: string
    toDate: string
  } | null
  onShiftBackNavigateToEmployeeEarnings?: (target: { employeeId: string; fromDate: string; toDate: string }) => void
  onInitialNavigationHandled?: () => void
}

type VerificationTab = "work_shifts" | "cash_sessions" | "review_queue"

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
const REVIEW_QUEUE_POLL_INTERVAL_MS = 2000

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getTodayDateInputValue = () => toDateInputValue(new Date())

const toDateOnlyValue = (raw: string) => {
  if (dateOnlyPattern.test(raw)) return raw

  const isoDateMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoDateMatch?.[1]) return isoDateMatch[1]

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toISOString().slice(0, 10)
}

const formatDate = (raw: string, locale: string) => {
  if (dateOnlyPattern.test(raw)) {
    const [yearRaw, monthRaw, dayRaw] = raw.split("-")
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const day = Number(dayRaw)
    if (year && month && day) {
      return new Date(year, month - 1, day).toLocaleDateString(locale)
    }
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleDateString(locale)
}

const formatTime = (raw: string | null, timeZone?: string | null) => formatTimeValue(raw, timeZone, "-")

const formatDuration = (startAt: string, endAt: string, labels: { hours: string; minutes: string }) => {
  const start = new Date(startAt)
  const end = new Date(endAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ""

  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours === 0) return `${restMinutes} ${labels.minutes}`
  if (restMinutes === 0) return `${hours} ${labels.hours}`
  return `${hours} ${labels.hours} ${restMinutes} ${labels.minutes}`
}

const formatWorkedDuration = (shift: VerificationShift, labels: { hours: string; minutes: string }) => {
  const minutes = resolveIntervalWorkedMinutes(shift)
  if (minutes == null || !Number.isFinite(minutes)) return ""
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours === 0) return `${restMinutes} ${labels.minutes}`
  if (restMinutes === 0) return `${hours} ${labels.hours}`
  return `${hours} ${labels.hours} ${restMinutes} ${labels.minutes}`
}

const formatInteger = (value: number | null | undefined, locale: string) => {
  if (value == null || !Number.isFinite(value)) return "-"
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

const formatMoney = (valueCents: number, currency: string | null | undefined, locale: string) => {
  const safeCurrency = currency || "CZK"
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 0,
    }).format(valueCents / 100)
  } catch {
    return `${Math.round(valueCents / 100)} ${safeCurrency}`
  }
}

const toShiftSortTime = (shift: VerificationShift) => {
  const closedAtTs = shift.closedAt ? new Date(shift.closedAt).getTime() : Number.NaN
  if (Number.isFinite(closedAtTs)) return closedAtTs
  const endAtTs = new Date(shift.endAt).getTime()
  if (Number.isFinite(endAtTs)) return endAtTs
  const startAtTs = new Date(shift.startAt).getTime()
  return Number.isFinite(startAtTs) ? startAtTs : 0
}

const toCashSortTime = (session: CashSessionDetails) => {
  const closedAtTs = session.closedAt ? new Date(session.closedAt).getTime() : Number.NaN
  if (Number.isFinite(closedAtTs)) return closedAtTs
  const reviewedAtTs = session.reviewedAt ? new Date(session.reviewedAt).getTime() : Number.NaN
  if (Number.isFinite(reviewedAtTs)) return reviewedAtTs
  const workdayTs = new Date(session.workday.workDate).getTime()
  return Number.isFinite(workdayTs) ? workdayTs : 0
}

const isShiftReviewed = (shift: VerificationShift) => shift.workday.status === "published"

const isShiftNeedsReview = (shift: VerificationShift) => shift.status === "completed" && !isShiftReviewed(shift)

const isCashSessionReviewed = (session: CashSessionDetails) => session.status === "reviewed"

const isCashSessionNeedsReview = (session: CashSessionDetails) => session.status === "closed"

function ShiftSalaryInline({
  shift,
  locale,
  salaryLabel,
}: {
  shift: VerificationShift
  locale: string
  salaryLabel: string
}) {
  const grossPayCents = shift.calculatedGrossPayCents
  const hasCalculatedSalary =
    typeof grossPayCents === "number" && Number.isFinite(grossPayCents)
  const salaryValue = hasCalculatedSalary ? formatMoney(grossPayCents, shift.currency, locale) : "—"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs",
        hasCalculatedSalary
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {salaryLabel} - <span className="ml-1 font-semibold">{salaryValue}</span>
    </span>
  )
}

const normalizeFormulaRows = (raw: unknown): CashFormulaRow[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const resultKey = typeof row.resultKey === "string" ? row.resultKey.trim() : ""
      const resultLabel = typeof row.resultLabel === "string" ? row.resultLabel.trim() : ""
      const expression = typeof row.expression === "string" ? row.expression.trim() : ""
      if (!resultKey || !resultLabel || !expression) return null

      return {
        id: typeof row.id === "string" ? row.id : `${resultKey}_${index}`,
        resultKey,
        resultLabel,
        expression,
        isTipsSource: row.isTipsSource === true,
        displayOrder: Number.isInteger(row.displayOrder) ? Number(row.displayOrder) : index,
      } satisfies CashFormulaRow
    })
    .filter((row): row is CashFormulaRow => row !== null)
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.resultKey.localeCompare(b.resultKey)
    })
}

const calculateSessionFormulaSummary = (
  formulas: CashFormulaRow[],
  fieldValues: CashSessionDetails["fieldValues"],
  formatFormulaError: (label: string, error: string) => string,
): { items: CashFormulaSummaryItem[]; error: string | null } => {
  if (formulas.length === 0) {
    return { items: [], error: null }
  }

  const allowedFieldKeys = new Set(fieldValues.map((value) => value.fieldKeySnapshot))
  const validation = validateAndCompileCashFormulaSet(
    formulas.map((formula) => ({
      resultKey: formula.resultKey,
      resultLabel: formula.resultLabel,
      expression: formula.expression,
      displayOrder: formula.displayOrder,
    })),
    allowedFieldKeys,
  )

  if (!validation.ok) {
    return {
      items: [],
      error: validation.error,
    }
  }

  const runtimeValues = Object.fromEntries(fieldValues.map((row) => [row.fieldKeySnapshot, row.valueCents])) as Record<
    string,
    number
  >
  const formulaMetaByKey = new Map(formulas.map((formula) => [formula.resultKey, formula]))
  const items: CashFormulaSummaryItem[] = []

  for (const formula of validation.orderedFormulas) {
    const formulaMeta = formulaMetaByKey.get(formula.resultKey)
    const expression = validation.compiledExpressionsByKey[formula.resultKey] ?? formula.expression
    const formulaKeys = new Set(extractCashFormulaKeys(expression))

    for (const key of formulaKeys) {
      if (!Object.prototype.hasOwnProperty.call(runtimeValues, key)) {
        runtimeValues[key] = 0
      }
    }

    const evaluation = evaluateCashFormulaExpression(expression, runtimeValues, formulaKeys)
    if (!evaluation.ok) {
      return {
        items: [],
        error: formatFormulaError(formulaMeta?.resultLabel ?? formula.resultLabel ?? formula.resultKey, evaluation.error),
      }
    }

    runtimeValues[formula.resultKey] = evaluation.value
    items.push({
      resultKey: formula.resultKey,
      resultLabel: formulaMeta?.resultLabel ?? formula.resultLabel ?? formula.resultKey,
      valueCents: evaluation.value,
      isTipsSource: Boolean(formulaMeta?.isTipsSource),
      displayOrder: formulaMeta?.displayOrder ?? formula.displayOrder ?? items.length,
    })
  }

  return {
    items: items.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.resultKey.localeCompare(b.resultKey)
    }),
    error: null,
  }
}

export default function CashRegisterVerificationView({
  onBack,
  initialTab,
  initialDate,
  initialSelectedShiftId,
  initialSelectedCashSessionId,
  initialShiftBackNavigation,
  onShiftBackNavigateToEmployeeEarnings,
  onInitialNavigationHandled,
}: Props) {
  const { t, language } = useTranslation()
  const organizationTimeZone = useAuthStore((state) => state.organization?.timezone)
  const locale = language === "en" ? "en-US" : "ru-RU"
  const durationLabels = { hours: t("hours_short"), minutes: t("minutes_suffix") }
  const [activeTab, setActiveTab] = useState<VerificationTab>(() => initialTab ?? "work_shifts")
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    initialDate && dateOnlyPattern.test(initialDate) ? initialDate : getTodayDateInputValue(),
  )
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [selectedCashSessionId, setSelectedCashSessionId] = useState<string | null>(null)
  const [shiftBackNavigation, setShiftBackNavigation] = useState(initialShiftBackNavigation ?? null)

  const [workShifts, setWorkShifts] = useState<VerificationShift[]>([])
  const [isWorkLoading, setIsWorkLoading] = useState(true)
  const [workLoadError, setWorkLoadError] = useState<string | null>(null)

  const [cashSessions, setCashSessions] = useState<CashSessionDetails[]>([])
  const [cashFormulasByLocation, setCashFormulasByLocation] = useState<Record<string, CashFormulaRow[]>>({})
  const [isCashLoading, setIsCashLoading] = useState(false)
  const [cashLoadError, setCashLoadError] = useState<string | null>(null)
  const [cashFormulaLoadError, setCashFormulaLoadError] = useState<string | null>(null)
  const [reviewWorkShifts, setReviewWorkShifts] = useState<VerificationShift[]>([])
  const [reviewCashSessions, setReviewCashSessions] = useState<CashSessionDetails[]>([])
  const [isReviewLoading, setIsReviewLoading] = useState(false)
  const [reviewLoadError, setReviewLoadError] = useState<string | null>(null)
  const [reviewActionError, setReviewActionError] = useState<string | null>(null)
  const [publishingWorkdayIds, setPublishingWorkdayIds] = useState<Record<string, boolean>>({})
  const [reviewingCashSessionIds, setReviewingCashSessionIds] = useState<Record<string, boolean>>({})
  const [reviewQueueCount, setReviewQueueCount] = useState(0)

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  useEffect(() => {
    if (!initialDate || !dateOnlyPattern.test(initialDate)) return
    setSelectedDate(initialDate)
  }, [initialDate])

  useEffect(() => {
    if (!initialShiftBackNavigation) return
    setShiftBackNavigation((current) => {
      if (
        current &&
        current.intervalId === initialShiftBackNavigation.intervalId &&
        current.employeeId === initialShiftBackNavigation.employeeId &&
        current.fromDate === initialShiftBackNavigation.fromDate &&
        current.toDate === initialShiftBackNavigation.toDate
      ) {
        return current
      }
      return initialShiftBackNavigation
    })
  }, [initialShiftBackNavigation])

  useEffect(() => {
    if (initialSelectedShiftId) {
      setSelectedShiftId((current) => (current === initialSelectedShiftId ? current : initialSelectedShiftId))
      onInitialNavigationHandled?.()
      return
    }

    if (initialSelectedCashSessionId) {
      setSelectedCashSessionId((current) =>
        current === initialSelectedCashSessionId ? current : initialSelectedCashSessionId,
      )
      onInitialNavigationHandled?.()
      return
    }

    if (initialTab || initialDate) {
      onInitialNavigationHandled?.()
    }
  }, [
    initialDate,
    initialSelectedCashSessionId,
    initialSelectedShiftId,
    initialTab,
    onInitialNavigationHandled,
  ])

  const loadFormulasForSessions = async (sessions: CashSessionDetails[], signal?: AbortSignal) => {
    const locationIds = Array.from(new Set(sessions.map((session) => session.cashRegister.locationId)))
    const formulaEntries = await Promise.all(
      locationIds.map(async (locationId) => {
        try {
          const settingsResponse = await fetch(`/api/cash/settings?locationId=${locationId}`, {
            credentials: "include",
            cache: "no-store",
            signal,
          })
          const settingsJson = (await settingsResponse.json().catch(() => null)) as CashSettingsResponse | null
          if (!settingsResponse.ok) {
            return {
              locationId,
              formulas: [] as CashFormulaRow[],
              ok: false,
            }
          }

          return {
            locationId,
            formulas: normalizeFormulaRows(settingsJson?.data?.formulas),
            ok: true,
          }
        } catch {
          return {
            locationId,
            formulas: [] as CashFormulaRow[],
            ok: false,
          }
        }
      }),
    )
    if (signal?.aborted) return null

    const formulasByLocation: Record<string, CashFormulaRow[]> = {}
    let formulasFailedCount = 0
    for (const entry of formulaEntries) {
      formulasByLocation[entry.locationId] = entry.formulas
      if (!entry.ok) formulasFailedCount += 1
    }

    return { formulasByLocation, formulasFailedCount }
  }

  const loadWorkShifts = async (workDate: string, signal?: AbortSignal) => {
    setIsWorkLoading(true)
    setWorkLoadError(null)
    try {
      const params = new URLSearchParams({ dateFrom: workDate, dateTo: workDate })
      const response = await fetch(`/api/intervals?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal,
      })
      const json = (await response.json().catch(() => null)) as IntervalsResponse | null
      if (!response.ok) {
        throw new Error(json?.error || t("verification_load_work_shifts_error"))
      }
      if (signal?.aborted) return

      const parsed = Array.isArray(json?.data) ? json.data : []
      const completed = parsed
        .filter((shift) => shift.status === "completed")
        .filter((shift) => toDateOnlyValue(shift.workday.workDate) === workDate)
        .sort((a, b) => toShiftSortTime(b) - toShiftSortTime(a))

      setWorkShifts(completed)
    } catch (error) {
      if (signal?.aborted) return
      setWorkShifts([])
      setWorkLoadError(error instanceof Error ? error.message : t("verification_load_work_shifts_error"))
    } finally {
      if (signal?.aborted) return
      setIsWorkLoading(false)
    }
  }

  const loadCashSessions = async (workDate: string, signal?: AbortSignal) => {
    setIsCashLoading(true)
    setCashLoadError(null)
    setCashFormulaLoadError(null)
    try {
      const params = new URLSearchParams({ workDate })
      const response = await fetch(`/api/cash/sessions?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal,
      })
      const json = (await response.json().catch(() => null)) as CashSessionsResponse | null
      if (!response.ok) {
        throw new Error(json?.error || t("verification_load_cash_sessions_error"))
      }
      if (signal?.aborted) return

      const parsed = Array.isArray(json?.data) ? json.data : []
      const closedSessions = parsed
        .filter((session) => session.status === "closed" || session.status === "reviewed")
        .filter((session) => toDateOnlyValue(session.workday.workDate) === workDate)
        .sort((a, b) => toCashSortTime(b) - toCashSortTime(a))

      setCashSessions(closedSessions)

      const formulasResult = await loadFormulasForSessions(closedSessions, signal)
      if (!formulasResult || signal?.aborted) return

      setCashFormulasByLocation(formulasResult.formulasByLocation)
      if (formulasResult.formulasFailedCount > 0) {
        setCashFormulaLoadError(t("verification_formulas_partial_error"))
      }
    } catch (error) {
      if (signal?.aborted) return
      setCashSessions([])
      setCashFormulasByLocation({})
      setCashLoadError(error instanceof Error ? error.message : t("verification_load_cash_sessions_error"))
    } finally {
      if (signal?.aborted) return
      setIsCashLoading(false)
    }
  }

  const loadReviewQueue = async (signal?: AbortSignal, options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (!silent) {
      setIsReviewLoading(true)
      setReviewLoadError(null)
    }
    try {
      const [intervalsResponse, cashSessionsResponse] = await Promise.all([
        fetch("/api/intervals", {
          credentials: "include",
          cache: "no-store",
          signal,
        }),
        fetch("/api/cash/sessions", {
          credentials: "include",
          cache: "no-store",
          signal,
        }),
      ])

      const intervalsJson = (await intervalsResponse.json().catch(() => null)) as IntervalsResponse | null
      if (!intervalsResponse.ok) {
        throw new Error(intervalsJson?.error || t("verification_load_review_work_error"))
      }

      const cashJson = (await cashSessionsResponse.json().catch(() => null)) as CashSessionsResponse | null
      if (!cashSessionsResponse.ok) {
        throw new Error(cashJson?.error || t("verification_load_review_cash_error"))
      }

      if (signal?.aborted) return

      const parsedIntervals = Array.isArray(intervalsJson?.data) ? intervalsJson.data : []
      const parsedSessions = Array.isArray(cashJson?.data) ? cashJson.data : []

      const queueWorkShifts = parsedIntervals
        .filter((shift) => shift.status === "completed")
        .filter((shift) => isShiftNeedsReview(shift))
        .sort((a, b) => toShiftSortTime(b) - toShiftSortTime(a))

      const queueCashSessions = parsedSessions
        .filter((session) => isCashSessionNeedsReview(session))
        .sort((a, b) => toCashSortTime(b) - toCashSortTime(a))

      setReviewWorkShifts(queueWorkShifts)
      setReviewCashSessions(queueCashSessions)
      setReviewQueueCount(queueWorkShifts.length + queueCashSessions.length)
      setReviewLoadError(null)
    } catch (error) {
      if (signal?.aborted) return
      if (!silent) {
        setReviewWorkShifts([])
        setReviewCashSessions([])
        setReviewQueueCount(0)
      }
      setReviewLoadError(error instanceof Error ? error.message : t("verification_load_review_error"))
    } finally {
      if (signal?.aborted || silent) return
      setIsReviewLoading(false)
    }
  }

  const loadReviewQueueCount = async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/verifications/summary", {
        credentials: "include",
        cache: "no-store",
        signal,
      })
      if (!response.ok) {
        return
      }
      const json = (await response.json().catch(() => null)) as VerificationSummaryResponse | null
      if (signal?.aborted) return
      const total = Number(json?.data?.totalOnReview ?? 0)
      setReviewQueueCount(Number.isFinite(total) ? Math.max(0, total) : 0)
    } catch {
      if (signal?.aborted) return
    }
  }

  const applyWorkdayPublished = (workdayId: string) => {
    const removedShiftIds = new Set<string>()

    for (const shift of reviewWorkShifts) {
      if (shift.workdayId === workdayId && isShiftNeedsReview(shift)) {
        removedShiftIds.add(shift.id)
      }
    }

    if (removedShiftIds.size === 0) {
      for (const shift of workShifts) {
        if (shift.workdayId === workdayId && isShiftNeedsReview(shift)) {
          removedShiftIds.add(shift.id)
        }
      }
    }

    const applyToShift = (shift: VerificationShift) =>
      shift.workdayId === workdayId
        ? {
            ...shift,
            workday: {
              ...shift.workday,
              status: "published",
            },
          }
        : shift

    setWorkShifts((prev) => prev.map(applyToShift))
    setReviewWorkShifts((prev) => prev.map(applyToShift).filter((shift) => isShiftNeedsReview(shift)))
    if (removedShiftIds.size > 0) {
      setReviewQueueCount((prev) => Math.max(0, prev - removedShiftIds.size))
    }
  }

  const applyCashSessionReviewed = (sessionId: string) => {
    const wasPendingReview =
      reviewCashSessions.some((session) => session.id === sessionId && isCashSessionNeedsReview(session)) ||
      cashSessions.some((session) => session.id === sessionId && isCashSessionNeedsReview(session))

    const applyToSession = (session: CashSessionDetails) =>
      session.id === sessionId
        ? {
            ...session,
            status: "reviewed",
            reviewedAt: new Date().toISOString(),
          }
        : session

    setCashSessions((prev) => prev.map(applyToSession))
    setReviewCashSessions((prev) => prev.map(applyToSession).filter((session) => isCashSessionNeedsReview(session)))
    if (wasPendingReview) {
      setReviewQueueCount((prev) => Math.max(0, prev - 1))
    }
  }

  const markWorkShiftReviewed = async (shift: VerificationShift) => {
    if (publishingWorkdayIds[shift.workdayId]) return
    setReviewActionError(null)
    setPublishingWorkdayIds((prev) => ({ ...prev, [shift.workdayId]: true }))
    try {
      const response = await fetch(`/api/workdays/${shift.workdayId}/publish`, {
        method: "POST",
        credentials: "include",
      })
      const json = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(json?.error || t("verification_mark_work_error"))
      }
      applyWorkdayPublished(shift.workdayId)
    } catch (error) {
      setReviewActionError(error instanceof Error ? error.message : t("verification_mark_work_error"))
    } finally {
      setPublishingWorkdayIds((prev) => {
        const next = { ...prev }
        delete next[shift.workdayId]
        return next
      })
    }
  }

  const markCashSessionReviewed = async (session: CashSessionDetails) => {
    if (reviewingCashSessionIds[session.id]) return
    setReviewActionError(null)
    setReviewingCashSessionIds((prev) => ({ ...prev, [session.id]: true }))
    try {
      const response = await fetch(`/api/cash/sessions/${session.id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({}),
      })
      const json = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(json?.error || t("verification_mark_cash_error"))
      }
      applyCashSessionReviewed(session.id)
    } catch (error) {
      setReviewActionError(error instanceof Error ? error.message : t("verification_mark_cash_error"))
    } finally {
      setReviewingCashSessionIds((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
    }
  }

  const editShiftActualHours = async (
    shift: VerificationShift,
    input: { openedTime: string; closedTime: string; openedAt?: string; closedAt?: string; reason: string },
  ) => {
    const response = await fetch(`/api/work-intervals/${shift.id}/owner-edit`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(input),
    })
    const json = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
      throw new Error(json?.error || t("verification_edit_actual_time_error"))
    }

    const editedWorkDate = toDateOnlyValue(shift.workday.workDate)
    await Promise.all([
      selectedDate === editedWorkDate ? loadWorkShifts(editedWorkDate) : Promise.resolve(),
      loadReviewQueue(undefined, { silent: true }),
      loadReviewQueueCount(),
    ])
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadWorkShifts(selectedDate, controller.signal)
    return () => controller.abort()
  }, [selectedDate])

  useEffect(() => {
    if (activeTab !== "cash_sessions") return
    const controller = new AbortController()
    void loadCashSessions(selectedDate, controller.signal)
    return () => controller.abort()
  }, [activeTab, selectedDate])

  useEffect(() => {
    if (activeTab !== "review_queue") return
    const controller = new AbortController()
    void loadReviewQueue(controller.signal)
    const intervalId = window.setInterval(() => {
      void loadReviewQueue(controller.signal, { silent: true })
    }, REVIEW_QUEUE_POLL_INTERVAL_MS)
    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [activeTab])

  useEffect(() => {
    const controller = new AbortController()
    void loadReviewQueueCount(controller.signal)
    const intervalId = window.setInterval(() => {
      void loadReviewQueueCount(controller.signal)
    }, REVIEW_QUEUE_POLL_INTERVAL_MS)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [])

  const reviewQueueBadgeLabel = reviewQueueCount > 99 ? "99+" : String(reviewQueueCount)

  const selectedShift = useMemo(
    () => {
      if (!selectedShiftId) return null
      return workShifts.find((shift) => shift.id === selectedShiftId)
        ?? reviewWorkShifts.find((shift) => shift.id === selectedShiftId)
        ?? null
    },
    [selectedShiftId, workShifts, reviewWorkShifts],
  )

  const selectedCashSession = useMemo(
    () => {
      if (!selectedCashSessionId) return null
      return cashSessions.find((session) => session.id === selectedCashSessionId)
        ?? reviewCashSessions.find((session) => session.id === selectedCashSessionId)
        ?? null
    },
    [cashSessions, reviewCashSessions, selectedCashSessionId],
  )

  const filteredWorkShifts = useMemo(
    () => workShifts.filter((shift) => toDateOnlyValue(shift.workday.workDate) === selectedDate),
    [selectedDate, workShifts],
  )

  const filteredCashSessions = useMemo(
    () => cashSessions.filter((session) => toDateOnlyValue(session.workday.workDate) === selectedDate),
    [cashSessions, selectedDate],
  )

  const cashFormulaSummaryBySessionId = useMemo(() => {
    const summaryById: Record<string, { items: CashFormulaSummaryItem[]; error: string | null }> = {}
    for (const session of filteredCashSessions) {
      const formulas = cashFormulasByLocation[session.cashRegister.locationId] ?? []
      summaryById[session.id] = calculateSessionFormulaSummary(formulas, session.fieldValues ?? [], (label, error) =>
        t("verification_formula_error", { label, error }),
      )
    }
    return summaryById
  }, [cashFormulasByLocation, filteredCashSessions, t])

  useEffect(() => {
    if (!shiftBackNavigation || !selectedShiftId) return
    if (selectedShiftId !== shiftBackNavigation.intervalId) {
      setShiftBackNavigation(null)
    }
  }, [selectedShiftId, shiftBackNavigation])

  const handleSelectedShiftBack = () => {
    if (
      selectedShift &&
      shiftBackNavigation &&
      selectedShift.id === shiftBackNavigation.intervalId &&
      onShiftBackNavigateToEmployeeEarnings
    ) {
      const { employeeId, fromDate, toDate } = shiftBackNavigation
      setSelectedShiftId(null)
      setShiftBackNavigation(null)
      onShiftBackNavigateToEmployeeEarnings({ employeeId, fromDate, toDate })
      return
    }

    setSelectedShiftId(null)
  }

  if (selectedShift) {
    return (
      <ShiftDetailsView
        interval={selectedShift}
        onBack={handleSelectedShiftBack}
        onMarkReviewed={() => markWorkShiftReviewed(selectedShift)}
        isMarkReviewedLoading={Boolean(publishingWorkdayIds[selectedShift.workdayId])}
        canEditActualHours={!isShiftReviewed(selectedShift)}
        onEditActualHours={(input) => editShiftActualHours(selectedShift, input)}
      />
    )
  }

  if (selectedCashSession) {
    return (
      <CashSessionDetailsView
        session={selectedCashSession}
        onBack={() => setSelectedCashSessionId(null)}
        onMarkReviewed={() => markCashSessionReviewed(selectedCashSession)}
        isMarkReviewedLoading={Boolean(reviewingCashSessionIds[selectedCashSession.id])}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background pb-6 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-4 space-y-4">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold">{t("verification_title")}</h1>
          </div>

          <div className="grid grid-cols-3 items-stretch gap-1.5 sm:gap-2">
            <Button
              variant={activeTab === "work_shifts" ? "default" : "outline"}
              className="h-auto min-h-12 rounded-2xl px-2 py-2 text-center text-[11px] leading-[1.15] whitespace-normal sm:h-10 sm:min-h-10 sm:rounded-full sm:px-3 sm:py-0 sm:text-sm sm:whitespace-nowrap"
              onClick={() => setActiveTab("work_shifts")}
            >
              {t("verification_work_shifts")}
            </Button>
            <Button
              variant={activeTab === "cash_sessions" ? "default" : "outline"}
              className="h-auto min-h-12 rounded-2xl px-2 py-2 text-center text-[11px] leading-[1.15] whitespace-normal sm:h-10 sm:min-h-10 sm:rounded-full sm:px-3 sm:py-0 sm:text-sm sm:whitespace-nowrap"
              onClick={() => setActiveTab("cash_sessions")}
            >
              {t("verification_cash_sessions")}
            </Button>
            <Button
              variant={activeTab === "review_queue" ? "default" : "outline"}
              className="h-auto min-h-12 flex-col gap-1 rounded-2xl px-2 py-2 text-center text-[11px] leading-[1.15] whitespace-normal sm:h-10 sm:min-h-10 sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3 sm:py-0 sm:text-sm sm:whitespace-nowrap"
              onClick={() => setActiveTab("review_queue")}
            >
              <span>{t("verification_review_queue")}</span>
              {reviewQueueCount > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-destructive-foreground sm:h-5 sm:min-w-5 sm:px-1.5 sm:text-[10px]">
                  {reviewQueueBadgeLabel}
                </span>
              )}
            </Button>
          </div>

          {activeTab !== "review_queue" && (
            <Input
              type="date"
              lang={language === "en" ? "en-US" : "ru-RU"}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || getTodayDateInputValue())}
              className="h-11 rounded-full border-border/70 bg-muted/30 px-4 text-base md:text-sm"
              aria-label={t("verification_date_aria")}
            />
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {reviewActionError && (
          <Card className="p-4 border-destructive/30 bg-destructive/5 text-destructive text-sm">{reviewActionError}</Card>
        )}

        {activeTab === "work_shifts" && (
          <>
            {isWorkLoading && <Card className="p-4 text-sm text-muted-foreground">{t("verification_loading_work_shifts")}</Card>}

            {!isWorkLoading && workLoadError && (
              <Card className="p-4 border-destructive/30 bg-destructive/5 text-destructive text-sm">
                {workLoadError}
              </Card>
            )}

            {!isWorkLoading && !workLoadError && filteredWorkShifts.length === 0 && (
              <Card className="p-8 text-sm text-muted-foreground text-center">
                {t("verification_no_work_shifts_for_date", { date: formatDate(selectedDate, locale) })}
              </Card>
            )}

            {!isWorkLoading &&
              !workLoadError &&
              filteredWorkShifts.map((shift) => {
                const workedDuration = formatWorkedDuration(shift, durationLabels)

                return (
                  <Card
                    key={shift.id}
                    className="p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedShiftId(shift.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="h-5 w-5 text-primary" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{shift.employee.fullName || t("common_employee_fallback")}</p>
                          <p className="text-sm text-muted-foreground truncate">{shift.position?.name || t("common_no_position")}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" strokeWidth={1.5} />
                        <span>{formatDate(shift.workday.workDate, locale)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" strokeWidth={1.5} />
                        <span>
                          {formatTime(shift.startAt, organizationTimeZone)} - {formatTime(shift.endAt, organizationTimeZone)} ({formatDuration(shift.startAt, shift.endAt, durationLabels)})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" strokeWidth={1.5} />
                        <span>
                          {t("verification_opened_closed", {
                            opened: formatTime(shift.openedAt, organizationTimeZone),
                            closed: formatTime(shift.closedAt, organizationTimeZone),
                          })}
                          {workedDuration ? ` • ${workedDuration}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {isShiftReviewed(shift) ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-700 border-green-500/20">
                          <CheckCircle2 className="h-3 w-3 mr-1" strokeWidth={1.5} />
                          {t("verification_checked")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                          <AlertCircle className="h-3 w-3 mr-1" strokeWidth={1.5} />
                          {t("verification_needs_review")}
                        </Badge>
                      )}
                      <ShiftSalaryInline shift={shift} locale={locale} salaryLabel={t("verification_salary")} />
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      size="sm"
                      disabled={isShiftReviewed(shift) || publishingWorkdayIds[shift.workdayId]}
                      onClick={(event) => {
                        event.stopPropagation()
                        void markWorkShiftReviewed(shift)
                      }}
                    >
                      {isShiftReviewed(shift)
                        ? t("verification_checked")
                        : publishingWorkdayIds[shift.workdayId]
                          ? t("verification_checking")
                          : t("verification_checked")}
                    </Button>
                  </Card>
                )
              })}
          </>
        )}

        {activeTab === "cash_sessions" && (
          <>
            {isCashLoading && <Card className="p-4 text-sm text-muted-foreground">{t("verification_loading_cash_sessions")}</Card>}

            {!isCashLoading && cashLoadError && (
              <Card className="p-4 border-destructive/30 bg-destructive/5 text-destructive text-sm">
                {cashLoadError}
              </Card>
            )}

            {!isCashLoading && !cashLoadError && cashFormulaLoadError && (
              <Card className="p-4 border-amber-500/30 bg-amber-500/5 text-amber-700 text-sm">
                {cashFormulaLoadError}
              </Card>
            )}

            {!isCashLoading && !cashLoadError && filteredCashSessions.length === 0 && (
              <Card className="p-8 text-sm text-muted-foreground text-center">
                {t("verification_no_cash_sessions_for_date", { date: formatDate(selectedDate, locale) })}
              </Card>
            )}

            {!isCashLoading &&
              !cashLoadError &&
              filteredCashSessions.map((session) => (
                <Card
                  key={session.id}
                  className="p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedCashSessionId(session.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <CreditCard className="h-5 w-5 text-primary" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{t("verification_cash_shift")}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {t("verification_workday")}: {formatDate(toDateOnlyValue(session.workday.workDate), locale)}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {t("verification_closed_by")}: {session.closedByEmployee?.fullName || t("common_not_specified")}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" strokeWidth={1.5} />
                      <span>{formatDate(toDateOnlyValue(session.workday.workDate), locale)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" strokeWidth={1.5} />
                      <span>
                        {t("verification_opened_closed", {
                          opened: formatTime(session.openedAt, organizationTimeZone),
                          closed: formatTime(session.closedAt, organizationTimeZone),
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-muted-foreground">{t("verification_formula_summary")}</div>
                      <Calculator className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                    </div>

                    {cashFormulaSummaryBySessionId[session.id]?.error ? (
                      <div className="text-xs text-destructive">{cashFormulaSummaryBySessionId[session.id]?.error}</div>
                    ) : cashFormulaSummaryBySessionId[session.id]?.items?.length ? (
                      <div className="space-y-1.5">
                        {cashFormulaSummaryBySessionId[session.id].items.map((item) => (
                          <div key={`${session.id}_${item.resultKey}`} className="flex items-center justify-between gap-3">
                            <div className="min-w-0 text-xs">
                              <span className="truncate">{item.resultLabel}</span>
                              {item.isTipsSource && (
                                <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-800">
                                  {t("verification_tips")}
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-semibold whitespace-nowrap">{formatInteger(item.valueCents, locale)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">{t("verification_formulas_not_configured")}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {isCashSessionReviewed(session) ? (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-700 border-green-500/20">
                        <CheckCircle2 className="h-3 w-3 mr-1" strokeWidth={1.5} />
                        {t("verification_checked")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                        <AlertCircle className="h-3 w-3 mr-1" strokeWidth={1.5} />
                        {t("verification_needs_review")}
                      </Badge>
                    )}
                    {(session.cashFieldPhotos?.length ?? 0) > 0 && (
                      <Badge variant="secondary" className="bg-sky-500/10 text-sky-700 border-sky-500/20">
                        <ImageIcon className="h-3 w-3 mr-1" strokeWidth={1.5} />
                        {t("verification_field_photos", { count: session.cashFieldPhotos?.length ?? 0 })}
                      </Badge>
                    )}
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    size="sm"
                    disabled={isCashSessionReviewed(session) || reviewingCashSessionIds[session.id]}
                    onClick={(event) => {
                      event.stopPropagation()
                      void markCashSessionReviewed(session)
                    }}
                  >
                    {isCashSessionReviewed(session)
                      ? t("verification_checked")
                      : reviewingCashSessionIds[session.id]
                        ? t("verification_checking")
                        : t("verification_checked")}
                  </Button>
                </Card>
              ))}
          </>
        )}

        {activeTab === "review_queue" && (
          <>
            {isReviewLoading && <Card className="p-4 text-sm text-muted-foreground">{t("verification_loading_review_queue")}</Card>}

            {!isReviewLoading && reviewLoadError && (
              <Card className="p-4 border-destructive/30 bg-destructive/5 text-destructive text-sm">{reviewLoadError}</Card>
            )}

            {!isReviewLoading && !reviewLoadError && reviewWorkShifts.length === 0 && reviewCashSessions.length === 0 && (
              <Card className="p-8 text-sm text-muted-foreground text-center">{t("verification_no_review_items")}</Card>
            )}

            {!isReviewLoading && !reviewLoadError && reviewWorkShifts.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground px-1">{t("verification_work_shifts")}</p>
                {reviewWorkShifts.map((shift) => (
                  <Card
                    key={shift.id}
                    className="p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedShiftId(shift.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="h-5 w-5 text-primary" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{shift.employee.fullName || t("common_employee_fallback")}</p>
                          <p className="text-sm text-muted-foreground truncate">{shift.position?.name || t("common_no_position")}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" strokeWidth={1.5} />
                        <span>{formatDate(shift.workday.workDate, locale)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" strokeWidth={1.5} />
                        <span>
                          {formatTime(shift.startAt, organizationTimeZone)} - {formatTime(shift.endAt, organizationTimeZone)} ({formatDuration(shift.startAt, shift.endAt, durationLabels)})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                        <AlertCircle className="h-3 w-3 mr-1" strokeWidth={1.5} />
                        {t("verification_needs_review")}
                      </Badge>
                      <ShiftSalaryInline shift={shift} locale={locale} salaryLabel={t("verification_salary")} />
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      size="sm"
                      disabled={publishingWorkdayIds[shift.workdayId]}
                      onClick={(event) => {
                        event.stopPropagation()
                        void markWorkShiftReviewed(shift)
                      }}
                    >
                      {publishingWorkdayIds[shift.workdayId] ? t("verification_checking") : t("verification_checked")}
                    </Button>
                  </Card>
                ))}
              </>
            )}

            {!isReviewLoading && !reviewLoadError && reviewCashSessions.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground px-1">{t("verification_cash_sessions")}</p>
                {reviewCashSessions.map((session) => (
                  <Card
                    key={session.id}
                    className="p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedCashSessionId(session.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <CreditCard className="h-5 w-5 text-primary" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{t("verification_cash_shift")}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {t("verification_workday")}: {formatDate(toDateOnlyValue(session.workday.workDate), locale)}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {t("verification_closed_by")}: {session.closedByEmployee?.fullName || t("common_not_specified")}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" strokeWidth={1.5} />
                        <span>{formatDate(toDateOnlyValue(session.workday.workDate), locale)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" strokeWidth={1.5} />
                        <span>
                          {t("verification_opened_closed", {
                            opened: formatTime(session.openedAt, organizationTimeZone),
                            closed: formatTime(session.closedAt, organizationTimeZone),
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                        <AlertCircle className="h-3 w-3 mr-1" strokeWidth={1.5} />
                        {t("verification_needs_review")}
                      </Badge>
                      {(session.cashFieldPhotos?.length ?? 0) > 0 && (
                        <Badge variant="secondary" className="bg-sky-500/10 text-sky-700 border-sky-500/20">
                          <ImageIcon className="h-3 w-3 mr-1" strokeWidth={1.5} />
                          {t("verification_field_photos", { count: session.cashFieldPhotos?.length ?? 0 })}
                        </Badge>
                      )}
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      size="sm"
                      disabled={reviewingCashSessionIds[session.id]}
                      onClick={(event) => {
                        event.stopPropagation()
                        void markCashSessionReviewed(session)
                      }}
                    >
                      {reviewingCashSessionIds[session.id] ? t("verification_checking") : t("verification_checked")}
                    </Button>
                  </Card>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
