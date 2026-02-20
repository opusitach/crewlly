"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ImagePreview } from "@/components/ui/image-preview"
import {
  AlertCircle,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock,
  Loader2,
  User,
} from "lucide-react"

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
  status: string
}

type ProcedureRule = {
  id: string
  type: "CHECKLIST" | "INPUT" | "PHOTO" | "CASH"
  title: string
  required: boolean
  order: number
  checklistItems: Array<{
    id: string
    title: string
    order: number
  }>
  answer: {
    id: string
    type: "CHECKLIST" | "INPUT" | "PHOTO" | "CASH"
    inputValue: string | null
    photoS3Key: string | null
    photoUrl: string | null
    photoComment: string | null
    photoDeletedAt: string | null
    checklistItems: Array<{
      itemId: string
      isChecked: boolean
    }>
  } | null
}

type ProcedureView = {
  id: string
  when: "OPEN" | "CLOSE"
  rules: ProcedureRule[]
}

type ProcedureResponse = {
  data?: {
    procedures?: ProcedureView[]
  }
  error?: string
}

type ShiftDetailsViewProps = {
  interval: VerificationShift
  onBack: () => void
  onMarkReviewed?: () => void | Promise<void>
  isMarkReviewedLoading?: boolean
}

const RULE_TYPE_LABELS: Record<Exclude<ProcedureRule["type"], "CASH">, string> = {
  CHECKLIST: "Чек-лист",
  INPUT: "Поле",
  PHOTO: "Фото",
}

const integerTokenRegex = /^-?\d+$/
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

const formatDate = (raw: string) => {
  if (dateOnlyPattern.test(raw)) {
    const [yearRaw, monthRaw, dayRaw] = raw.split("-")
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const day = Number(dayRaw)
    if (year && month && day) {
      return new Date(year, month - 1, day).toLocaleDateString("ru-RU")
    }
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleDateString("ru-RU")
}

const formatTime = (raw: string | null) => {
  if (!raw) return "-"
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return "-"
  const hh = parsed.getHours().toString().padStart(2, "0")
  const mm = parsed.getMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}

const formatDuration = (startAt: string, endAt: string) => {
  const start = new Date(startAt)
  const end = new Date(endAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-"

  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours === 0) return `${restMinutes} мин`
  if (restMinutes === 0) return `${hours} ч`
  return `${hours} ч ${restMinutes} мин`
}

const formatInteger = (value: string) => {
  if (!integerTokenRegex.test(value.trim())) return value
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(number)
}

function RuleValue({ rule }: { rule: Exclude<ProcedureRule, { type: "CASH" }> }) {
  if (rule.type === "CHECKLIST") {
    const checkedIds = new Set((rule.answer?.checklistItems ?? []).filter((item) => item.isChecked).map((item) => item.itemId))

    if (rule.checklistItems.length === 0) {
      return <p className="text-sm text-muted-foreground">Пункты чек-листа не заданы</p>
    }

    return (
      <div className="space-y-2">
        {rule.checklistItems.map((item) => {
          const isChecked = checkedIds.has(item.id)
          return (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              {isChecked ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={1.5} />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              )}
              <span className={isChecked ? "text-foreground" : "text-muted-foreground"}>{item.title}</span>
            </div>
          )
        })}
      </div>
    )
  }

  if (rule.type === "INPUT") {
    const value = (rule.answer?.inputValue ?? "").trim()
    if (!value) {
      return <p className="text-sm text-muted-foreground">Не заполнено</p>
    }
    return <p className="text-base font-medium">{formatInteger(value)}</p>
  }

  const photoUrl = rule.answer?.photoUrl ?? null
  const photoComment = (rule.answer?.photoComment ?? "").trim()

  return (
    <div className="space-y-3">
      {photoUrl ? (
        <ImagePreview
          src={photoUrl}
          alt={rule.title}
          triggerClassName="w-full rounded-lg border border-border"
          imageClassName="w-full max-h-60 rounded-lg object-cover"
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Фото не добавлено</div>
      )}
      {photoComment && (
        <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">Комментарий</p>
          <p className="mt-1">{photoComment}</p>
        </div>
      )}
    </div>
  )
}

export default function ShiftDetailsView({
  interval,
  onBack,
  onMarkReviewed,
  isMarkReviewedLoading = false,
}: ShiftDetailsViewProps) {
  const [procedures, setProcedures] = useState<{
    open: ProcedureView | null
    close: ProcedureView | null
  }>({
    open: null,
    close: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/work-intervals/${interval.id}/procedures`, {
          credentials: "include",
        })
        const json = (await response.json().catch(() => null)) as ProcedureResponse | null

        if (!response.ok) {
          throw new Error(json?.error || "Не удалось загрузить данные процедур")
        }

        const procedureRows = Array.isArray(json?.data?.procedures) ? json.data.procedures : []
        const openProcedure = procedureRows.find((item) => item.when === "OPEN") ?? null
        const closeProcedure = procedureRows.find((item) => item.when === "CLOSE") ?? null

        setProcedures({
          open: openProcedure,
          close: closeProcedure,
        })
      } catch (loadError) {
        setProcedures({
          open: null,
          close: null,
        })
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные процедур")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [interval.id])

  const renderProcedureCard = (input: {
    title: string
    stageLabel: "OPEN" | "CLOSE"
    loadingText: string
    emptyText: string
    procedure: ProcedureView | null
  }) => {
    const visibleRules = input.procedure
      ? input.procedure.rules
          .filter((rule): rule is Exclude<ProcedureRule, { type: "CASH" }> => rule.type !== "CASH")
          .sort((a, b) => a.order - b.order)
      : []

    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{input.title}</h2>
          <Badge variant="secondary" className="bg-muted/60">
            <Camera className="h-3 w-3 mr-1" strokeWidth={1.5} />
            {input.stageLabel}
          </Badge>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            {input.loadingText}
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        )}

        {!isLoading && !error && !input.procedure && <p className="text-sm text-muted-foreground">{input.emptyText}</p>}

        {!isLoading && !error && input.procedure && visibleRules.length === 0 && (
          <p className="text-sm text-muted-foreground">Нет данных для отображения.</p>
        )}

        {!isLoading && !error && input.procedure && visibleRules.length > 0 && (
          <div className="space-y-3">
            {visibleRules.map((rule) => (
              <Card key={rule.id} className="p-3 space-y-3 border-border/70">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">
                      {rule.title}
                      {rule.required && <span className="text-destructive"> *</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{RULE_TYPE_LABELS[rule.type]}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {RULE_TYPE_LABELS[rule.type]}
                  </Badge>
                </div>

                <RuleValue rule={rule} />
              </Card>
            ))}
          </div>
        )}
      </Card>
    )
  }

  const isReviewed = interval.workday.status === "published"

  return (
    <div className="min-h-screen bg-background pb-6 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold">Детали смены</h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-semibold text-base">{interval.employee.fullName || "Сотрудник"}</p>
              <p className="text-sm text-muted-foreground">{interval.position?.name || "Без позиции"}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Дата</p>
              <p className="font-medium mt-0.5">{formatDate(interval.workday.workDate)}</p>
            </div>
            <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Длительность</p>
              <p className="font-medium mt-0.5">{formatDuration(interval.startAt, interval.endAt)}</p>
            </div>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" strokeWidth={1.5} />
              <span>{formatDate(interval.workday.workDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" strokeWidth={1.5} />
              <span>
                {formatTime(interval.startAt)} - {formatTime(interval.endAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" strokeWidth={1.5} />
              <span>
                Открыта: {formatTime(interval.openedAt)} • Закрыта: {formatTime(interval.closedAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {interval.workday.status === "published" ? (
              <Badge variant="secondary" className="bg-green-500/10 text-green-700 border-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" strokeWidth={1.5} />
                Проверено
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                <AlertCircle className="h-3 w-3 mr-1" strokeWidth={1.5} />
                Требует проверки
              </Badge>
            )}
          </div>
        </Card>

        {renderProcedureCard({
          title: "Заполненные данные открытия",
          stageLabel: "OPEN",
          loadingText: "Загрузка данных открытия...",
          emptyText: "Для этой смены пока нет заполненных правил открытия.",
          procedure: procedures.open,
        })}

        {renderProcedureCard({
          title: "Заполненные данные закрытия",
          stageLabel: "CLOSE",
          loadingText: "Загрузка данных закрытия...",
          emptyText: "Для этой смены пока нет заполненных правил закрытия.",
          procedure: procedures.close,
        })}

        <Button
          type="button"
          className="w-full h-11"
          disabled={isReviewed || !onMarkReviewed || isMarkReviewedLoading}
          onClick={() => {
            if (!onMarkReviewed) return
            void onMarkReviewed()
          }}
        >
          {isReviewed ? "Проверено" : isMarkReviewedLoading ? "Проверяем..." : "Проверено"}
        </Button>
      </div>
    </div>
  )
}
