"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"
import { Calendar, ChevronLeft, Calculator } from "lucide-react"
import { useTranslation } from "@/lib/i18n/context"

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const formatCashValue = (value: number | null | undefined, locale: string) => {
  if (value == null || !Number.isFinite(value)) return "-"
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

const formatWorkDate = (workDate: string, locale: string) => {
  const [yearRaw, monthRaw, dayRaw] = workDate.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!year || !month || !day) return workDate
  return new Date(year, month - 1, day).toLocaleDateString(locale)
}

const formatChartDateLabel = (workDate: string, locale: string) => {
  const [yearRaw, monthRaw, dayRaw] = workDate.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!year || !month || !day) return workDate
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  })
}

type HistoryItem = {
  sessionId: string
  workdayId: string
  workDate: string
  cashRegisterName: string
  cashSessionStatus: string
  valueCents: number
  actorName: string | null
}

type ChartPoint = {
  date: string
  valueCents: number
  trendCents: number
  entriesCount: number
}

type FormulaDetailsPayload = {
  formula: {
    resultKey: string
    resultLabel: string
    isTipsSource: boolean
  }
  summary: {
    totalValueCents: number
    previousTotalCents: number
    averageValueCents: number
    entriesCount: number
    changePercent: number | null
    formulaErrors: number
    formulaWarnings: string[]
  }
  chart: {
    points: ChartPoint[]
  }
  history: HistoryItem[]
}

const EMPTY_DATA: FormulaDetailsPayload = {
  formula: {
    resultKey: "",
    resultLabel: "",
    isTipsSource: false,
  },
  summary: {
    totalValueCents: 0,
    previousTotalCents: 0,
    averageValueCents: 0,
    entriesCount: 0,
    changePercent: 0,
    formulaErrors: 0,
    formulaWarnings: [],
  },
  chart: {
    points: [],
  },
  history: [],
}

type Props = {
  onBack: () => void
  resultKey: string
  resultLabel: string
  initialFromDate: string
  initialToDate: string
}

export default function ReportCashFormulaView({
  onBack,
  resultKey,
  resultLabel,
  initialFromDate,
  initialToDate,
}: Props) {
  const { t, language } = useTranslation()
  const locale = language === "en" ? "en-US" : "ru-RU"
  const chartConfig = useMemo(
    () =>
      ({
        valueCents: {
          label: t("reports_chart_value"),
          color: "hsl(var(--primary))",
        },
        trendCents: {
          label: t("reports_chart_trend"),
          color: "hsl(var(--muted-foreground))",
        },
      }) satisfies ChartConfig,
    [t],
  )
  const today = useMemo(() => new Date(), [])
  const defaultFrom = useMemo(() => toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)), [today])
  const defaultTo = useMemo(() => toDateInputValue(today), [today])

  const [fromDate, setFromDate] = useState(initialFromDate || defaultFrom)
  const [toDate, setToDate] = useState(initialToDate || defaultTo)
  const [appliedRange, setAppliedRange] = useState({
    fromDate: initialFromDate || defaultFrom,
    toDate: initialToDate || defaultTo,
  })

  const [details, setDetails] = useState<FormulaDetailsPayload>({
    ...EMPTY_DATA,
    formula: {
      resultKey,
      resultLabel,
      isTipsSource: false,
    },
  })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setIsLoading(true)
      setLoadError(null)

      try {
        const params = new URLSearchParams()
        if (appliedRange.fromDate) params.set("dateFrom", appliedRange.fromDate)
        if (appliedRange.toDate) params.set("dateTo", appliedRange.toDate)

        const response = await fetch(`/api/reports/cash-formulas/${encodeURIComponent(resultKey)}?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        })

        const json = (await response.json().catch(() => null)) as
          | {
              data?: Partial<FormulaDetailsPayload>
              error?: string
            }
          | null

        if (!response.ok || !json?.data) {
          throw new Error(json?.error || t("reports_load_formula_details_error"))
        }

        const raw = json.data
        const points = Array.isArray(raw.chart?.points)
          ? raw.chart?.points
              .map((point) => {
                if (!point || typeof point !== "object") return null
                const row = point as Record<string, unknown>
                return {
                  date: typeof row.date === "string" ? row.date : "",
                  valueCents: Number.isInteger(row.valueCents) ? Number(row.valueCents) : 0,
                  trendCents: Number.isInteger(row.trendCents) ? Number(row.trendCents) : 0,
                  entriesCount: Number.isInteger(row.entriesCount) ? Number(row.entriesCount) : 0,
                } satisfies ChartPoint
              })
              .filter((point): point is ChartPoint => point !== null && Boolean(point.date))
          : []

        const history = Array.isArray(raw.history)
          ? raw.history
              .map((item) => {
                if (!item || typeof item !== "object") return null
                const row = item as Record<string, unknown>
                const sessionId = typeof row.sessionId === "string" ? row.sessionId : ""
                const workdayId = typeof row.workdayId === "string" ? row.workdayId : ""
                const workDate = typeof row.workDate === "string" ? row.workDate : ""
                if (!sessionId || !workdayId || !workDate) return null

                return {
                  sessionId,
                  workdayId,
                  workDate,
                  cashRegisterName: typeof row.cashRegisterName === "string" ? row.cashRegisterName : t("reports_cash_register_fallback"),
                  cashSessionStatus: typeof row.cashSessionStatus === "string" ? row.cashSessionStatus : "closed",
                  valueCents: Number.isInteger(row.valueCents) ? Number(row.valueCents) : 0,
                  actorName: typeof row.actorName === "string" ? row.actorName : null,
                } satisfies HistoryItem
              })
              .filter((item): item is HistoryItem => item !== null)
          : []

        const nextData: FormulaDetailsPayload = {
          formula: {
            resultKey: typeof raw.formula?.resultKey === "string" ? raw.formula.resultKey : resultKey,
            resultLabel: typeof raw.formula?.resultLabel === "string" ? raw.formula.resultLabel : resultLabel,
            isTipsSource: raw.formula?.isTipsSource === true,
          },
          summary: {
            totalValueCents: Number.isInteger(raw.summary?.totalValueCents) ? Number(raw.summary?.totalValueCents) : 0,
            previousTotalCents: Number.isInteger(raw.summary?.previousTotalCents)
              ? Number(raw.summary?.previousTotalCents)
              : 0,
            averageValueCents: Number.isInteger(raw.summary?.averageValueCents) ? Number(raw.summary?.averageValueCents) : 0,
            entriesCount: Number.isInteger(raw.summary?.entriesCount) ? Number(raw.summary?.entriesCount) : 0,
            changePercent: typeof raw.summary?.changePercent === "number" ? raw.summary.changePercent : null,
            formulaErrors: Number.isInteger(raw.summary?.formulaErrors) ? Number(raw.summary?.formulaErrors) : 0,
            formulaWarnings: Array.isArray(raw.summary?.formulaWarnings)
              ? raw.summary.formulaWarnings.filter((item): item is string => typeof item === "string")
              : [],
          },
          chart: {
            points,
          },
          history,
        }

        if (!active) return
        setDetails(nextData)
      } catch (error) {
        if (!active) return
        setDetails({
          ...EMPTY_DATA,
          formula: {
            resultKey,
            resultLabel,
            isTipsSource: false,
          },
        })
        setLoadError(error instanceof Error ? error.message : t("reports_load_formula_details_error"))
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [appliedRange.fromDate, appliedRange.toDate, resultKey, resultLabel, t])

  const chartPoints = useMemo(
    () =>
      details.chart.points.map((point) => ({
        ...point,
        dateLabel: formatChartDateLabel(point.date, locale),
      })),
    [details.chart.points, locale],
  )

  const hasChartData = useMemo(() => chartPoints.some((point) => point.valueCents !== 0), [chartPoints])

  const changeText =
    details.summary.changePercent == null
      ? t("reports_no_comparison_base")
      : t("reports_change_vs_previous", {
          value: `${details.summary.changePercent > 0 ? "+" : ""}${details.summary.changePercent.toFixed(1)}`,
        })

  const statusLabels: Record<string, string> = {
    open: t("reports_status_open"),
    closing_draft: t("reports_status_closing_draft"),
    closed: t("reports_status_closed"),
    reviewed: t("reports_status_reviewed"),
  }

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold truncate max-w-[230px] text-center">{details.formula.resultLabel || resultLabel}</h1>
            <div className="w-10" />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1">{t("reports_cash_formula_subtitle")}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
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

        {loadError ? (
          <Card className="p-4 border-destructive/30 bg-destructive/5 text-sm text-destructive">{loadError}</Card>
        ) : (
          <>
            <Card className="p-4 space-y-3">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">{t("reports_loading_summary")}</p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">{t("reports_total_for_period")}</p>
                      <p className="text-3xl font-bold mt-1">{formatCashValue(details.summary.totalValueCents, locale)}</p>
                    </div>
                    <div className="rounded-xl bg-primary/10 p-2.5">
                      <Calculator className="h-5 w-5 text-primary" strokeWidth={1.5} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Card className="p-3 bg-muted/30 border-border/70">
                      <p className="text-xs text-muted-foreground">{t("reports_average_per_shift")}</p>
                      <p className="font-semibold mt-1">{formatCashValue(details.summary.averageValueCents, locale)}</p>
                    </Card>
                    <Card className="p-3 bg-muted/30 border-border/70">
                      <p className="text-xs text-muted-foreground">{t("reports_shifts_in_period")}</p>
                      <p className="font-semibold mt-1">{details.summary.entriesCount}</p>
                    </Card>
                  </div>

                  <p className="text-xs text-muted-foreground">{changeText}</p>
                  {details.formula.isTipsSource && (
                    <div className="text-xs rounded bg-amber-100 text-amber-800 px-2 py-1 w-fit">{t("reports_tips_source")}</div>
                  )}

                  {details.summary.formulaWarnings.length > 0 && (
                    <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {details.summary.formulaWarnings[0]}
                    </div>
                  )}

                  {details.summary.formulaErrors > 0 && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {t("reports_formula_errors_short", { count: details.summary.formulaErrors })}
                    </div>
                  )}
                </>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <h2 className="text-base font-semibold">{t("reports_dynamics")}</h2>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">{t("reports_building_chart")}</p>
              ) : chartPoints.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("reports_no_period_data")}</p>
              ) : (
                <>
                  <ChartContainer config={chartConfig} className="h-56 w-full aspect-auto">
                    <AreaChart data={chartPoints} margin={{ left: 10, right: 8, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="formulaValueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-valueCents)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--color-valueCents)" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical strokeDasharray="4 6" />
                      <XAxis
                        dataKey="dateLabel"
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                        tickMargin={10}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={60}
                        tickMargin={6}
                        tickFormatter={(value) => formatCashValue(Number(value), locale)}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            indicator="dashed"
                            labelFormatter={(label) => t("reports_chart_date", { date: String(label) })}
                            formatter={(value, name) => {
                              const numeric = typeof value === "number" ? value : Number(value)
                              return (
                                <div className="flex w-full items-center justify-between gap-3">
                                  <span className="text-muted-foreground">{String(name) === "trendCents" ? t("reports_chart_trend") : t("reports_chart_value")}</span>
                                  <span className="font-medium tabular-nums">{formatCashValue(Number.isFinite(numeric) ? numeric : 0, locale)}</span>
                                </div>
                              )
                            }}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="valueCents"
                        stroke="var(--color-valueCents)"
                        fill="url(#formulaValueFill)"
                        strokeWidth={2.5}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="trendCents"
                        stroke="var(--color-trendCents)"
                        strokeDasharray="5 5"
                        strokeWidth={1.7}
                        dot={false}
                      />
                    </AreaChart>
                  </ChartContainer>
                  {!hasChartData && <p className="text-xs text-muted-foreground">{t("reports_all_values_zero")}</p>}
                </>
              )}
            </Card>

            <div className="space-y-3">
              <h2 className="text-base font-semibold">{t("reports_history")}</h2>
              {isLoading ? (
                <Card className="p-4 text-sm text-muted-foreground">{t("reports_loading_history")}</Card>
              ) : details.history.length === 0 ? (
                <Card className="p-4 text-sm text-muted-foreground">{t("reports_history_empty")}</Card>
              ) : (
                <div className="space-y-2">
                  {details.history.map((item) => (
                    <Card key={item.sessionId} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">{formatWorkDate(item.workDate, locale)}</p>
                          <p className="text-xs text-muted-foreground">{item.cashRegisterName}</p>
                        </div>
                        <p className="font-semibold text-sm">{formatCashValue(item.valueCents, locale)}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded bg-muted px-2 py-1">
                          {statusLabels[item.cashSessionStatus] || item.cashSessionStatus}
                        </span>
                        <span className="rounded bg-muted px-2 py-1">{t("reports_shift_id", { id: item.sessionId.slice(0, 8) })}</span>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {t("reports_entered_by", { name: item.actorName || t("common_not_specified") })}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
