"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MoneyHistorySkeleton, MoneySummarySkeleton } from "@/components/ui/page-skeletons"
import { useAuthStore } from "@/lib/store/auth-store"
import { formatTimeValue } from "@/lib/utils/timezone"
import { Calendar, ChevronLeft, Clock, Gift, ShieldAlert } from "lucide-react"
import { useTranslation } from "@/lib/i18n/context"

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/

const isDateInputValue = (value: string | null | undefined): value is string =>
  typeof value === "string" && dateInputPattern.test(value)

type AdjustmentType = "bonus" | "penalty"

type EarningsItem = {
  id: string
  itemType: "shift" | "adjustment"
  workDate: string
  startAt: string | null
  endAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  usedActualTime: boolean
  status: string
  positionName: string | null
  minutesWorked: number
  grossPayCents: number
  tipsCents: number
  bonusCents: number
  penaltyCents: number
  totalAccruedCents: number
  adjustmentType: AdjustmentType | null
  adjustmentComment: string | null
}

type EarningsSummary = {
  totalGrossCents: number
  totalSalaryCents: number
  totalTipsCents: number
  totalBonusCents: number
  totalPenaltyCents: number
  totalAdjustmentsCents: number
  totalAccruedCents: number
  totalMinutesWorked: number
  shiftsCount: number
  adjustmentCount: number
  currency: string | null
}

const EMPTY_SUMMARY: EarningsSummary = {
  totalGrossCents: 0,
  totalSalaryCents: 0,
  totalTipsCents: 0,
  totalBonusCents: 0,
  totalPenaltyCents: 0,
  totalAdjustmentsCents: 0,
  totalAccruedCents: 0,
  totalMinutesWorked: 0,
  shiftsCount: 0,
  adjustmentCount: 0,
  currency: "CZK",
}

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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

const formatWorkDate = (workDate: string, locale: string) => {
  const [yearRaw, monthRaw, dayRaw] = workDate.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!year || !month || !day) return workDate
  return new Date(year, month - 1, day).toLocaleDateString(locale)
}

const formatPeriodDate = (value: string) => {
  const [yearRaw, monthRaw, dayRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!year || !month || !day) return value
  return `${dayRaw.padStart(2, "0")}-${monthRaw.padStart(2, "0")}-${yearRaw}`
}

const normalizeItem = (item: Partial<EarningsItem>): EarningsItem => ({
  id: item.id ?? "",
  itemType: item.itemType === "adjustment" ? "adjustment" : "shift",
  workDate: item.workDate ?? "",
  startAt: typeof item.startAt === "string" ? item.startAt : null,
  endAt: typeof item.endAt === "string" ? item.endAt : null,
  actualStartAt: typeof item.actualStartAt === "string" ? item.actualStartAt : null,
  actualEndAt: typeof item.actualEndAt === "string" ? item.actualEndAt : null,
  usedActualTime: Boolean(item.usedActualTime),
  status: item.status ?? "completed",
  positionName: item.positionName ?? null,
  minutesWorked: Number.isInteger(item.minutesWorked) ? Number(item.minutesWorked) : 0,
  grossPayCents: Number.isInteger(item.grossPayCents) ? Number(item.grossPayCents) : 0,
  tipsCents: Number.isInteger(item.tipsCents) ? Number(item.tipsCents) : 0,
  bonusCents: Number.isInteger(item.bonusCents) ? Number(item.bonusCents) : 0,
  penaltyCents: Number.isInteger(item.penaltyCents) ? Number(item.penaltyCents) : 0,
  totalAccruedCents: Number.isInteger(item.totalAccruedCents)
    ? Number(item.totalAccruedCents)
    : (Number.isInteger(item.grossPayCents) ? Number(item.grossPayCents) : 0) +
      (Number.isInteger(item.tipsCents) ? Number(item.tipsCents) : 0),
  adjustmentType: item.adjustmentType === "bonus" || item.adjustmentType === "penalty" ? item.adjustmentType : null,
  adjustmentComment: typeof item.adjustmentComment === "string" ? item.adjustmentComment : null,
})

const normalizeSummary = (rawSummary: Record<string, unknown>): EarningsSummary => {
  const totalGrossCents = Number.isInteger(rawSummary.totalGrossCents) ? Number(rawSummary.totalGrossCents) : 0
  const totalSalaryCents = Number.isInteger(rawSummary.totalSalaryCents)
    ? Number(rawSummary.totalSalaryCents)
    : totalGrossCents
  const totalTipsCents = Number.isInteger(rawSummary.totalTipsCents) ? Number(rawSummary.totalTipsCents) : 0
  const totalBonusCents = Number.isInteger(rawSummary.totalBonusCents) ? Number(rawSummary.totalBonusCents) : 0
  const totalPenaltyCents = Number.isInteger(rawSummary.totalPenaltyCents) ? Number(rawSummary.totalPenaltyCents) : 0
  const totalAdjustmentsCents = Number.isInteger(rawSummary.totalAdjustmentsCents)
    ? Number(rawSummary.totalAdjustmentsCents)
    : totalBonusCents - totalPenaltyCents

  return {
    totalGrossCents,
    totalSalaryCents,
    totalTipsCents,
    totalBonusCents,
    totalPenaltyCents,
    totalAdjustmentsCents,
    totalAccruedCents: Number.isInteger(rawSummary.totalAccruedCents)
      ? Number(rawSummary.totalAccruedCents)
      : totalSalaryCents + totalTipsCents + totalAdjustmentsCents,
    totalMinutesWorked: Number.isInteger(rawSummary.totalMinutesWorked) ? Number(rawSummary.totalMinutesWorked) : 0,
    shiftsCount: Number.isInteger(rawSummary.shiftsCount) ? Number(rawSummary.shiftsCount) : 0,
    adjustmentCount: Number.isInteger(rawSummary.adjustmentCount) ? Number(rawSummary.adjustmentCount) : 0,
    currency: typeof rawSummary.currency === "string" ? rawSummary.currency : "CZK",
  }
}

const summaryTileClass = "rounded-2xl border border-border/70 bg-muted/20 px-3 py-2.5"

type WorkerMoneyViewProps = {
  onBack: () => void
  hideHeader?: boolean
  initialFromDate?: string
  initialToDate?: string
  onInitialNavigationHandled?: () => void
}

export default function WorkerMoneyView({
  onBack,
  hideHeader = false,
  initialFromDate,
  initialToDate,
  onInitialNavigationHandled,
}: WorkerMoneyViewProps) {
  const { t, language } = useTranslation()
  const organizationTimeZone = useAuthStore((state) => state.organization?.timezone)
  const today = useMemo(() => new Date(), [])
  const defaultFrom = useMemo(() => toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)), [today])
  const defaultTo = useMemo(() => toDateInputValue(today), [today])
  const initialRange = useMemo(() => {
    const fromDate = isDateInputValue(initialFromDate) ? initialFromDate : defaultFrom
    const toDate = isDateInputValue(initialToDate) ? initialToDate : defaultTo
    if (toDate < fromDate) {
      return { fromDate: defaultFrom, toDate: defaultTo }
    }
    return { fromDate, toDate }
  }, [defaultFrom, defaultTo, initialFromDate, initialToDate])

  const [fromDate, setFromDate] = useState(initialRange.fromDate)
  const [toDate, setToDate] = useState(initialRange.toDate)
  const [appliedRange, setAppliedRange] = useState(initialRange)
  const [items, setItems] = useState<EarningsItem[]>([])
  const [summary, setSummary] = useState<EarningsSummary>(EMPTY_SUMMARY)
  const [isLoading, setIsLoading] = useState(true)

  const dateLocale = language === "en" ? "en-US" : "ru-RU"

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    const h = t("hours_suffix")
    const m = t("minutes_suffix")
    if (hours === 0) return `${rest} ${m}`
    if (rest === 0) return `${hours} ${h}`
    return `${hours} ${h} ${rest} ${m}`
  }

  const formatRoundedHours = (minutes: number) => `${Math.round(minutes / 60)} ${t("hours_suffix")}`

  const formatTimeRange = (startAt: string | null, endAt: string | null) => {
    if (!startAt || !endAt) return t("reports_outside_shift")
    return `${formatTimeValue(startAt, organizationTimeZone, "--:--")} — ${formatTimeValue(endAt, organizationTimeZone, "--:--")}`
  }

  const getStatusLabel = (status: string) => {
    if (status === "completed") return t("reports_status_completed")
    if (status === "canceled") return t("reports_status_canceled")
    return status
  }

  useEffect(() => {
    setFromDate((prev) => (prev === initialRange.fromDate ? prev : initialRange.fromDate))
    setToDate((prev) => (prev === initialRange.toDate ? prev : initialRange.toDate))
    setAppliedRange((prev) =>
      prev.fromDate === initialRange.fromDate && prev.toDate === initialRange.toDate ? prev : initialRange,
    )
    onInitialNavigationHandled?.()
  }, [initialRange.fromDate, initialRange.toDate])

  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (appliedRange.fromDate) params.set("dateFrom", appliedRange.fromDate)
        if (appliedRange.toDate) params.set("dateTo", appliedRange.toDate)

        const res = await fetch(`/api/worker/earnings?${params.toString()}`, { credentials: "include", cache: "no-store" })
        if (!res.ok) {
          setItems([])
          setSummary(EMPTY_SUMMARY)
          return
        }

        const json = await res.json()
        const rawItems = Array.isArray(json?.data?.items) ? json.data.items : []
        const rawSummary = (json?.data?.summary ?? {}) as Record<string, unknown>
        setItems(rawItems.map((item: Partial<EarningsItem>) => normalizeItem(item)))
        setSummary(normalizeSummary(rawSummary))
      } catch {
        setItems([])
        setSummary(EMPTY_SUMMARY)
      } finally {
        setIsLoading(false)
      }
    }

    void loadItems()
  }, [appliedRange.fromDate, appliedRange.toDate])

  const renderAdjustmentHistoryCard = (item: EarningsItem) => {
    const isBonus = item.adjustmentType === "bonus"
    const amountCents = isBonus ? item.bonusCents : item.penaltyCents
    const badgeClass = isBonus
      ? "border-emerald-300/70 bg-emerald-50 text-emerald-700"
      : "border-rose-300/70 bg-rose-50 text-rose-700"
    const Icon = isBonus ? Gift : ShieldAlert

    return (
      <Card key={item.id} className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="font-semibold">{formatWorkDate(item.workDate, dateLocale)}</p>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass}`}>
              <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
              {isBonus ? t("money_bonus_badge") : t("money_penalty_badge")}
            </span>
          </div>
          <div className="text-right">
            <p className={`text-lg font-semibold ${isBonus ? "text-emerald-700" : "text-rose-700"}`}>
              {formatMoney(isBonus ? amountCents : -amountCents, summary.currency, dateLocale)}
            </p>
            <p className="text-[11px] text-muted-foreground">{t("money_manual_adjustment")}</p>
          </div>
        </div>

        <div className={`rounded-xl border px-3 py-3 ${isBonus ? "border-emerald-200/80 bg-emerald-50/60" : "border-rose-200/80 bg-rose-50/60"}`}>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("money_comment_label")}</p>
          <p className="mt-1.5 text-sm leading-6">{item.adjustmentComment || t("money_no_comment")}</p>
        </div>
      </Card>
    )
  }

  const renderShiftHistoryCard = (item: EarningsItem) => (
    <Card key={item.id} className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{formatWorkDate(item.workDate, dateLocale)}</p>
          <p className="text-sm text-muted-foreground">
            {item.positionName || t("money_no_position")} • {getStatusLabel(item.status)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{formatMoney(item.totalAccruedCents, summary.currency, dateLocale)}</p>
          <p className="text-[11px] text-muted-foreground">{t("reports_salary_plus_tips")}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("employee_profile_salary")}</p>
          <p className="mt-0.5 font-medium">{formatMoney(item.grossPayCents, summary.currency, dateLocale)}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("verification_tips")}</p>
          <p className="mt-0.5 font-medium">{formatMoney(item.tipsCents, summary.currency, dateLocale)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" strokeWidth={1.5} />
          <span>{formatTimeRange(item.actualStartAt, item.actualEndAt)}</span>
        </div>
        <span className="font-medium">{formatRoundedHours(item.minutesWorked)}</span>
      </div>
      {!item.usedActualTime && (
        <p className="text-xs text-muted-foreground">{t("money_no_actual_time")}</p>
      )}
    </Card>
  )

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      {!hideHeader && (
        <div className="sticky top-0 z-10 bg-background">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-xl font-semibold">{t("money_title")}</h1>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4">
        {hideHeader && (
          <h1 className="text-xl font-semibold">{t("money_title")}</h1>
        )}

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4" strokeWidth={1.5} />
            {t("reports_period")}
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
            {t("reports_apply_period")}
          </Button>
          {fromDate && toDate && toDate < fromDate && (
            <p className="text-xs text-destructive">{t("reports_invalid_period")}</p>
          )}
        </Card>

        <Card className="p-4 space-y-3 sm:p-5">
          {isLoading ? (
            <MoneySummarySkeleton />
          ) : (
            <>
              <div className="space-y-1.5 text-center">
                <p className="text-xs font-medium text-muted-foreground">
                  {formatPeriodDate(appliedRange.fromDate)} — {formatPeriodDate(appliedRange.toDate)}
                </p>
                <div className="text-3xl font-bold leading-none tracking-tight sm:text-[2.125rem]">
                  {formatMoney(summary.totalAccruedCents, summary.currency, dateLocale)}
                </div>
                <p className="text-xs text-muted-foreground">{t("money_accrued_period")}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className={summaryTileClass}>
                  <p className="text-xs text-muted-foreground">{t("employee_profile_salary")}</p>
                  <p className="mt-1 text-[1.05rem] font-semibold leading-tight">
                    {formatMoney(summary.totalSalaryCents, summary.currency, dateLocale)}
                  </p>
                </div>
                <div className={summaryTileClass}>
                  <p className="text-xs text-muted-foreground">{t("verification_tips")}</p>
                  <p className="mt-1 text-[1.05rem] font-semibold leading-tight">
                    {formatMoney(summary.totalTipsCents, summary.currency, dateLocale)}
                  </p>
                </div>
                <div className={`${summaryTileClass} border-emerald-200/80 bg-emerald-50/60`}>
                  <p className="text-xs text-emerald-700/80">{t("money_bonuses")}</p>
                  <p className="mt-1 text-[1.05rem] font-semibold leading-tight text-emerald-700">
                    {formatMoney(summary.totalBonusCents, summary.currency, dateLocale)}
                  </p>
                </div>
                <div className={`${summaryTileClass} border-rose-200/80 bg-rose-50/60`}>
                  <p className="text-xs text-rose-700/80">{t("money_penalties")}</p>
                  <p className="mt-1 text-[1.05rem] font-semibold leading-tight text-rose-700">
                    {formatMoney(summary.totalPenaltyCents === 0 ? 0 : -summary.totalPenaltyCents, summary.currency, dateLocale)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div className="text-center">
                  <p className="text-xl font-bold leading-none sm:text-2xl">{summary.shiftsCount}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("money_shifts_label")}</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold leading-none sm:text-2xl">{formatMinutes(summary.totalMinutesWorked)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("money_worked")}</p>
                </div>
              </div>
            </>
          )}
        </Card>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("money_history_title")}</h2>
          {isLoading && <MoneyHistorySkeleton />}
          {!isLoading && items.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">{t("money_history_empty")}</Card>
          )}
          {!isLoading && items.length > 0 && (
            <div className="space-y-3">
              {items.map((item) => (item.itemType === "adjustment" ? renderAdjustmentHistoryCard(item) : renderShiftHistoryCard(item)))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
