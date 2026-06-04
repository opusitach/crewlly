"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ImagePreview } from "@/components/ui/image-preview"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuthStore } from "@/lib/store/auth-store"
import { useTranslation } from "@/lib/i18n/context"
import { resolveIntervalWorkedMinutes } from "@/lib/utils/interval-worked-duration"
import { formatTimeValue } from "@/lib/utils/timezone"
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
  breakMinutes?: number | null
  calculatedMinutesWorked?: number | null
  timeEntry?: {
    clockInAt?: string | null
    clockOutAt?: string | null
  } | null
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
  canEditActualHours?: boolean
  onEditActualHours?: (input: {
    openedTime: string
    closedTime: string
    openedAt?: string
    closedAt?: string
    reason: string
  }) => Promise<void>
}

const integerTokenRegex = /^-?\d+$/
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
const timeInputPattern = /^([01]\d|2[0-3]):([0-5]\d)$/

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
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-"

  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours === 0) return `${restMinutes} ${labels.minutes}`
  if (restMinutes === 0) return `${hours} ${labels.hours}`
  return `${hours} ${labels.hours} ${restMinutes} ${labels.minutes}`
}

const toTimeInputValue = (primary: string | null | undefined, timeZone?: string | null, fallback?: string | null) => {
  const primaryFormatted = formatTime(primary ?? null, timeZone)
  if (primaryFormatted !== "-") return primaryFormatted

  const fallbackFormatted = formatTime(fallback ?? null, timeZone)
  return fallbackFormatted !== "-" ? fallbackFormatted : "00:00"
}

const formatInteger = (value: string, locale: string) => {
  if (!integerTokenRegex.test(value.trim())) return value
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(number)
}

function RuleValue({
  rule,
  locale,
  text,
}: {
  rule: Exclude<ProcedureRule, { type: "CASH" }>
  locale: string
  text: {
    checklistEmpty: string
    notFilled: string
    photoMissing: string
    comment: string
  }
}) {
  if (rule.type === "CHECKLIST") {
    const checkedIds = new Set((rule.answer?.checklistItems ?? []).filter((item) => item.isChecked).map((item) => item.itemId))

    if (rule.checklistItems.length === 0) {
      return <p className="text-sm text-muted-foreground">{text.checklistEmpty}</p>
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
      return <p className="text-sm text-muted-foreground">{text.notFilled}</p>
    }
    return <p className="text-base font-medium">{formatInteger(value, locale)}</p>
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
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{text.photoMissing}</div>
      )}
      {photoComment && (
        <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">{text.comment}</p>
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
  canEditActualHours = false,
  onEditActualHours,
}: ShiftDetailsViewProps) {
  const { t, language } = useTranslation()
  const organizationTimeZone = useAuthStore((state) => state.organization?.timezone)
  const locale = language === "en" ? "en-US" : "ru-RU"
  const durationLabels = { hours: t("hours_short"), minutes: t("minutes_suffix") }
  const workedMinutes = resolveIntervalWorkedMinutes(interval)
  const workedDuration =
    workedMinutes == null || !Number.isFinite(workedMinutes)
      ? ""
      : formatDuration(new Date(0).toISOString(), new Date(Math.max(0, workedMinutes) * 60000).toISOString(), durationLabels)
  const [procedures, setProcedures] = useState<{
    open: ProcedureView | null
    close: ProcedureView | null
  }>({
    open: null,
    close: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editedOpenedTime, setEditedOpenedTime] = useState(() => toTimeInputValue(interval.openedAt, organizationTimeZone, interval.startAt))
  const [editedClosedTime, setEditedClosedTime] = useState(() => toTimeInputValue(interval.closedAt, organizationTimeZone, interval.endAt))
  const [editReason, setEditReason] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)

  useEffect(() => {
    setEditedOpenedTime(toTimeInputValue(interval.openedAt, organizationTimeZone, interval.startAt))
    setEditedClosedTime(toTimeInputValue(interval.closedAt, organizationTimeZone, interval.endAt))
  }, [interval.closedAt, interval.endAt, interval.openedAt, interval.startAt, organizationTimeZone])

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
          throw new Error(json?.error || t("verification_load_procedures_error"))
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
        setError(loadError instanceof Error ? loadError.message : t("verification_load_procedures_error"))
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [interval.id, t])

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
          <p className="text-sm text-muted-foreground">{t("verification_no_display_data")}</p>
        )}

        {!isLoading && !error && input.procedure && visibleRules.length > 0 && (
          <div className="space-y-3">
            {visibleRules.map((rule) => {
              const ruleTypeLabel =
                rule.type === "CHECKLIST"
                  ? t("verification_rule_checklist")
                  : rule.type === "INPUT"
                    ? t("verification_rule_input")
                    : t("verification_rule_photo")

              return (
                <Card key={rule.id} className="p-3 space-y-3 border-border/70">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">
                        {rule.title}
                        {rule.required && <span className="text-destructive"> *</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{ruleTypeLabel}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {ruleTypeLabel}
                    </Badge>
                  </div>

                  <RuleValue
                    rule={rule}
                    locale={locale}
                    text={{
                      checklistEmpty: t("verification_checklist_empty"),
                      notFilled: t("verification_not_filled"),
                      photoMissing: t("verification_photo_missing"),
                      comment: t("verification_comment"),
                    }}
                  />
                </Card>
              )
            })}
          </div>
        )}
      </Card>
    )
  }

  const isReviewed = interval.workday.status === "published"

  const handleEditDialogOpenChange = (open: boolean) => {
    if (!open && isEditSubmitting) return

    setIsEditDialogOpen(open)
    if (open) {
      setEditedOpenedTime(toTimeInputValue(interval.openedAt, organizationTimeZone, interval.startAt))
      setEditedClosedTime(toTimeInputValue(interval.closedAt, organizationTimeZone, interval.endAt))
      setEditReason("")
      setEditError(null)
    }
  }

  const handleEditActualHoursSubmit = async () => {
    if (!onEditActualHours) return

    const normalizedReason = editReason.trim()
    if (!normalizedReason) {
      setEditError(t("verification_reason_required"))
      return
    }

    if (!timeInputPattern.test(editedOpenedTime) || !timeInputPattern.test(editedClosedTime)) {
      setEditError(t("verification_invalid_time"))
      return
    }

    setEditError(null)
    setIsEditSubmitting(true)

    try {
      await onEditActualHours({
        openedTime: editedOpenedTime,
        closedTime: editedClosedTime,
        reason: normalizedReason,
      })
      setIsEditDialogOpen(false)
      setEditReason("")
    } catch (submitError) {
      setEditError(submitError instanceof Error ? submitError.message : t("verification_save_actual_time_error"))
    } finally {
      setIsEditSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-6 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full -ml-2">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold">{t("verification_shift_details_title")}</h1>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-semibold text-base">{interval.employee.fullName || t("common_employee_fallback")}</p>
              <p className="text-sm text-muted-foreground">{interval.position?.name || t("common_no_position")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{t("common_date")}</p>
              <p className="font-medium mt-0.5">{formatDate(interval.workday.workDate, locale)}</p>
            </div>
            <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{t("common_duration")}</p>
              <p className="font-medium mt-0.5">{formatDuration(interval.startAt, interval.endAt, durationLabels)}</p>
            </div>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" strokeWidth={1.5} />
              <span>{formatDate(interval.workday.workDate, locale)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" strokeWidth={1.5} />
              <span>
                {formatTime(interval.startAt, organizationTimeZone)} - {formatTime(interval.endAt, organizationTimeZone)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" strokeWidth={1.5} />
              <span>
                {t("verification_opened_closed", {
                  opened: formatTime(interval.openedAt, organizationTimeZone),
                  closed: formatTime(interval.closedAt, organizationTimeZone),
                })}
                {workedDuration ? ` • ${workedDuration}` : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {interval.workday.status === "published" ? (
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
          </div>

          {onEditActualHours && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!canEditActualHours || isEditSubmitting}
              onClick={() => handleEditDialogOpenChange(true)}
            >
              {isEditSubmitting ? t("verification_saving") : t("verification_change_hours")}
            </Button>
          )}
        </Card>

        {renderProcedureCard({
          title: t("verification_open_data_title"),
          stageLabel: "OPEN",
          loadingText: t("verification_loading_open_data"),
          emptyText: t("verification_open_rules_empty"),
          procedure: procedures.open,
        })}

        {renderProcedureCard({
          title: t("verification_close_data_title"),
          stageLabel: "CLOSE",
          loadingText: t("verification_loading_close_data"),
          emptyText: t("verification_close_rules_empty"),
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
          {isReviewed ? t("verification_checked") : isMarkReviewedLoading ? t("verification_checking") : t("verification_checked")}
        </Button>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogOpenChange}>
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle>{t("verification_edit_actual_time_title")}</DialogTitle>
            <DialogDescription>{t("verification_edit_actual_time_desc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-shift-opened-time">{t("verification_start")}</Label>
              <Input
                id="edit-shift-opened-time"
                type="time"
                lang="en-GB"
                step={60}
                value={editedOpenedTime}
                disabled={isEditSubmitting}
                onChange={(event) => setEditedOpenedTime(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-shift-closed-time">{t("verification_end")}</Label>
              <Input
                id="edit-shift-closed-time"
                type="time"
                lang="en-GB"
                step={60}
                value={editedClosedTime}
                disabled={isEditSubmitting}
                onChange={(event) => setEditedClosedTime(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-shift-reason">{t("verification_reason")}</Label>
              <Textarea
                id="edit-shift-reason"
                value={editReason}
                disabled={isEditSubmitting}
                onChange={(event) => setEditReason(event.target.value)}
                placeholder={t("verification_reason_placeholder")}
              />
            </div>

            {editError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {editError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={isEditSubmitting} onClick={() => handleEditDialogOpenChange(false)}>
              {t("common_cancel")}
            </Button>
            <Button type="button" disabled={isEditSubmitting} onClick={() => void handleEditActualHoursSubmit()}>
              {isEditSubmitting ? t("verification_saving") : t("common_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
