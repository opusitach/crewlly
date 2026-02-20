"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ChevronLeft, Calendar, Clock } from "lucide-react"

type EarningsItem = {
  id: string
  workDate: string
  startAt: string
  endAt: string
  actualStartAt: string
  actualEndAt: string
  usedActualTime: boolean
  status: string
  positionName: string | null
  minutesWorked: number
  grossPayCents: number
  tipsCents: number
  totalAccruedCents: number
}

type EarningsSummary = {
  totalGrossCents: number
  totalSalaryCents: number
  totalTipsCents: number
  totalAccruedCents: number
  totalMinutesWorked: number
  shiftsCount: number
  currency: string | null
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

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} мин`
  if (rest === 0) return `${hours} ч`
  return `${hours} ч ${rest} мин`
}

const formatRoundedHours = (minutes: number) => `${Math.round(minutes / 60)} ч`

const formatTimeRange = (startAt: string, endAt: string) => {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const pad = (value: number) => value.toString().padStart(2, "0")
  return `${pad(start.getHours())}:${pad(start.getMinutes())} — ${pad(end.getHours())}:${pad(end.getMinutes())}`
}

const formatWorkDate = (workDate: string) => {
  const [yearRaw, monthRaw, dayRaw] = workDate.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!year || !month || !day) return workDate
  return new Date(year, month - 1, day).toLocaleDateString("ru-RU")
}

const STATUS_LABELS: Record<string, string> = {
  completed: "Завершена",
  canceled: "Отменена",
}

export default function WorkerMoneyView({ onBack, hideHeader = false }: { onBack: () => void; hideHeader?: boolean }) {
  const today = useMemo(() => new Date(), [])
  const defaultFrom = useMemo(() => toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)), [today])
  const defaultTo = useMemo(() => toDateInputValue(today), [today])

  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(defaultTo)
  const [appliedRange, setAppliedRange] = useState({ fromDate: defaultFrom, toDate: defaultTo })
  const [items, setItems] = useState<EarningsItem[]>([])
  const [summary, setSummary] = useState<EarningsSummary>({
    totalGrossCents: 0,
    totalSalaryCents: 0,
    totalTipsCents: 0,
    totalAccruedCents: 0,
    totalMinutesWorked: 0,
    shiftsCount: 0,
    currency: "CZK",
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (appliedRange.fromDate) params.set("dateFrom", appliedRange.fromDate)
        if (appliedRange.toDate) params.set("dateTo", appliedRange.toDate)

        const res = await fetch(`/api/worker/earnings?${params.toString()}`, { credentials: "include" })
        if (!res.ok) {
          setItems([])
          setSummary({
            totalGrossCents: 0,
            totalSalaryCents: 0,
            totalTipsCents: 0,
            totalAccruedCents: 0,
            totalMinutesWorked: 0,
            shiftsCount: 0,
            currency: "CZK",
          })
          return
        }
        const json = await res.json()
        const rawItems = (json?.data?.items ?? []) as Array<Partial<EarningsItem>>
        setItems(
          rawItems.map((item) => ({
            id: item.id ?? "",
            workDate: item.workDate ?? "",
            startAt: item.startAt ?? "",
            endAt: item.endAt ?? "",
            actualStartAt: item.actualStartAt ?? item.startAt ?? "",
            actualEndAt: item.actualEndAt ?? item.endAt ?? "",
            usedActualTime: Boolean(item.usedActualTime),
            status: item.status ?? "completed",
            positionName: item.positionName ?? null,
            minutesWorked: Number.isInteger(item.minutesWorked) ? Number(item.minutesWorked) : 0,
            grossPayCents: Number.isInteger(item.grossPayCents) ? Number(item.grossPayCents) : 0,
            tipsCents: Number.isInteger(item.tipsCents) ? Number(item.tipsCents) : 0,
            totalAccruedCents: Number.isInteger(item.totalAccruedCents)
              ? Number(item.totalAccruedCents)
              : (Number.isInteger(item.grossPayCents) ? Number(item.grossPayCents) : 0) +
                (Number.isInteger(item.tipsCents) ? Number(item.tipsCents) : 0),
          })),
        )
        const rawSummary = json?.data?.summary ?? {}
        const totalGrossCents = Number.isInteger(rawSummary.totalGrossCents) ? Number(rawSummary.totalGrossCents) : 0
        const totalSalaryCents = Number.isInteger(rawSummary.totalSalaryCents)
          ? Number(rawSummary.totalSalaryCents)
          : totalGrossCents
        const totalTipsCents = Number.isInteger(rawSummary.totalTipsCents) ? Number(rawSummary.totalTipsCents) : 0
        setSummary({
          totalGrossCents,
          totalSalaryCents,
          totalTipsCents,
          totalAccruedCents: Number.isInteger(rawSummary.totalAccruedCents)
            ? Number(rawSummary.totalAccruedCents)
            : totalSalaryCents + totalTipsCents,
          totalMinutesWorked: Number.isInteger(rawSummary.totalMinutesWorked) ? Number(rawSummary.totalMinutesWorked) : 0,
          shiftsCount: Number.isInteger(rawSummary.shiftsCount) ? Number(rawSummary.shiftsCount) : 0,
          currency: typeof rawSummary.currency === "string" ? rawSummary.currency : "CZK",
        })
      } catch {
        setItems([])
        setSummary({
          totalGrossCents: 0,
          totalSalaryCents: 0,
          totalTipsCents: 0,
          totalAccruedCents: 0,
          totalMinutesWorked: 0,
          shiftsCount: 0,
          currency: "CZK",
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadItems()
  }, [appliedRange.fromDate, appliedRange.toDate])

  const hasData = items.length > 0

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      {!hideHeader && (
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-xl font-semibold">Деньги</h1>
              <div className="w-10" />
            </div>
          </div>
        </div>
      )}

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

        <Card className="p-6 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка выплат...</p>
          ) : hasData ? (
            <>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  {appliedRange.fromDate} — {appliedRange.toDate}
                </p>
                <div className="text-4xl font-bold">{formatMoney(summary.totalAccruedCents, summary.currency)}</div>
                <p className="text-xs text-muted-foreground">Начислено за выбранный период</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Card className="p-3 bg-muted/30 border-border/70">
                  <p className="text-xs text-muted-foreground">Зарплата</p>
                  <p className="text-base font-semibold mt-1">{formatMoney(summary.totalSalaryCents, summary.currency)}</p>
                </Card>
                <Card className="p-3 bg-muted/30 border-border/70">
                  <p className="text-xs text-muted-foreground">Чаевые</p>
                  <p className="text-base font-semibold mt-1">{formatMoney(summary.totalTipsCents, summary.currency)}</p>
                </Card>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div className="text-center">
                  <p className="text-2xl font-bold">{summary.shiftsCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Смен</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{formatMinutes(summary.totalMinutesWorked)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Отработано</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Нет данных по выплатам</p>
          )}
        </Card>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">История начислений</h2>
          {isLoading && <Card className="p-4 text-sm text-muted-foreground">Загрузка истории...</Card>}
          {!isLoading && items.length === 0 && <Card className="p-4 text-sm text-muted-foreground">История пока пустая</Card>}
          {!isLoading && items.length > 0 && (
            <div className="space-y-3">
              {items.map((item) => (
                <Card key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{formatWorkDate(item.workDate)}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.positionName || "Без позиции"} • {STATUS_LABELS[item.status] || item.status}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">{formatMoney(item.totalAccruedCents, summary.currency)}</p>
                      <p className="text-[11px] text-muted-foreground">зарплата + чаевые</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Зарплата</p>
                      <p className="font-medium mt-0.5">{formatMoney(item.grossPayCents, summary.currency)}</p>
                    </div>
                    <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Чаевые</p>
                      <p className="font-medium mt-0.5">{formatMoney(item.tipsCents, summary.currency)}</p>
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
                    <p className="text-xs text-muted-foreground">Фактические отметки отсутствуют, расчет по графику</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
