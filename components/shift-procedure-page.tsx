"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImagePreview } from "@/components/ui/image-preview"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  decodeCashProcedureValues,
  encodeCashProcedureValues,
  isCashIntegerDraftToken,
  isCashIntegerToken,
} from "@/lib/cash/procedure-values"

type ProcedureRuleType = "CHECKLIST" | "INPUT" | "PHOTO" | "CASH"
type ProcedureWhen = "OPEN" | "CLOSE"

type ProcedureRuleItem = {
  id: string
  title: string
  order: number
}

type ProcedureAnswer = {
  id: string
  type: ProcedureRuleType
  inputValue?: string | null
  photoS3Key?: string | null
  photoUrl?: string | null
  cashPhotos?: Record<string, { photoS3Key: string | null; photoUrl: string | null }>
  photoComment?: string | null
  photoDeletedAt?: string | null
  checklistItems?: { itemId: string; isChecked: boolean }[]
}

type ProcedureRule = {
  id: string
  type: ProcedureRuleType
  title: string
  required: boolean
  order: number
  cashLocked?: boolean
  cashLockMessage?: string | null
  cashSourceIntervalId?: string | null
  cashFields: Array<{
    key: string
    label: string
    isRequired: boolean
    isPhotoRequired?: boolean
  }>
  checklistItems: ProcedureRuleItem[]
  answer: ProcedureAnswer | null
}

type ProcedureData = {
  id: string
  when: ProcedureWhen
  totalRequired?: number | null
  completedRequired?: number | null
  rules: ProcedureRule[]
}

type IntervalInfo = {
  id: string
  status: string
  startAt: string
  endAt: string
  openedAt?: string | null
  closedAt?: string | null
  positionId?: string | null
  workDate?: string
  payPreview?: {
    hourlyRateCents?: number | null
    fixedShiftRateCents?: number | null
    percentRevenueBp?: number | null
    elapsedMinutes?: number
    estimatedSalaryCents?: number | null
    salaryMessage?: string | null
    currency?: string | null
  } | null
  canForce?: boolean
}

type RuleAnswerState = {
  inputValue: string
  cashValues: Record<string, string>
  cashPhotos: Record<string, { photoS3Key: string | null; photoUrl: string | null; photoPreviewUrl: string | null }>
  checklist: Record<string, boolean>
  photoS3Key: string | null
  photoUrl: string | null
  photoPreviewUrl: string | null
  photoComment: string
}

const isChecklistComplete = (rule: ProcedureRule, state?: RuleAnswerState) => {
  if (!state) return false
  if (rule.checklistItems.length === 0) return false
  return rule.checklistItems.every((item) => state.checklist[item.id])
}

const isInputComplete = (state?: RuleAnswerState) => Boolean(state?.inputValue?.trim())

const isPhotoComplete = (state?: RuleAnswerState) => Boolean(state?.photoS3Key || state?.photoUrl)

const hasCashFieldPhoto = (state: RuleAnswerState | undefined, fieldKey: string) => {
  const fieldPhoto = state?.cashPhotos?.[fieldKey]
  return Boolean(fieldPhoto?.photoS3Key || fieldPhoto?.photoUrl)
}

const isCashFieldPhotoMissing = (rule: ProcedureRule, fieldKey: string, state?: RuleAnswerState) => {
  const field = rule.cashFields.find((item) => item.key === fieldKey)
  if (!field || !field.isPhotoRequired) return false
  const token = state?.cashValues?.[fieldKey] ?? ""
  if (!isCashIntegerToken(token)) return false
  return !hasCashFieldPhoto(state, fieldKey)
}

const isCashComplete = (rule: ProcedureRule, state?: RuleAnswerState) => {
  if (rule.cashLocked) return true
  if (rule.cashFields.length === 0) return true
  const values = state?.cashValues ?? {}
  return rule.cashFields.every((field) => {
    const token = values[field.key] ?? ""
    const hasValue = isCashIntegerToken(token)
    if (field.isRequired && !hasValue) return false
    if (field.isPhotoRequired && hasValue && !hasCashFieldPhoto(state, field.key)) return false
    return true
  })
}

const isRuleComplete = (rule: ProcedureRule, state?: RuleAnswerState) => {
  if (rule.type === "CHECKLIST") return isChecklistComplete(rule, state)
  if (rule.type === "INPUT") return isInputComplete(state)
  if (rule.type === "PHOTO") return isPhotoComplete(state)
  if (rule.type === "CASH") return isCashComplete(rule, state)
  return false
}

function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (blob: Blob, previewUrl: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let active = true
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(() => setError("Не удалось получить доступ к камере"))

    return () => {
      active = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [open])

  const handleCapture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const previewUrl = URL.createObjectURL(blob)
      onCapture(blob, previewUrl)
      onOpenChange(false)
    }, "image/jpeg")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Сделайте фото</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black/20" />
          )}
          <Button className="w-full" onClick={handleCapture} disabled={!!error}>
            Сделать снимок
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function ShiftProcedurePage({ intervalId }: { intervalId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const whenParam = (searchParams.get("when") || "OPEN") as ProcedureWhen

  const [interval, setInterval] = useState<IntervalInfo | null>(null)
  const [procedure, setProcedure] = useState<ProcedureData | null>(null)
  const [answers, setAnswers] = useState<Record<string, RuleAnswerState>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cameraTarget, setCameraTarget] = useState<{ ruleId: string; cashFieldKey?: string } | null>(null)
  const [uploadingPhotoKey, setUploadingPhotoKey] = useState<string | null>(null)
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())

  const toPhotoUploadKey = (ruleId: string, cashFieldKey?: string) => (cashFieldKey ? `${ruleId}:${cashFieldKey}` : ruleId)

  const canEdit = interval ? !["completed", "canceled"].includes(interval.status) : true
  const isOpenInProgress = whenParam === "OPEN" && interval?.status === "in_progress"

  const refreshData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/work-intervals/${intervalId}/procedures?when=${whenParam}`, {
        credentials: "include",
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "Не удалось загрузить процедуры")
      }
      const procedures = json?.data?.procedures ?? []
      const nextProcedure = procedures[0] ?? null
      setInterval(json?.data?.interval ?? null)
      setProcedure(nextProcedure)
      if (nextProcedure) {
        const nextAnswers: Record<string, RuleAnswerState> = {}
        for (const rule of nextProcedure.rules as ProcedureRule[]) {
          const checklistState: Record<string, boolean> = {}
          rule.checklistItems.forEach((item) => {
            checklistState[item.id] =
              rule.answer?.checklistItems?.find((state) => state.itemId === item.id)?.isChecked ?? false
          })
          const cashValues =
            rule.type === "CASH"
              ? decodeCashProcedureValues(
                  rule.answer?.inputValue ?? "",
                  rule.cashFields.map((field) => field.key),
                )
              : {}
          const cashPhotos =
            rule.type === "CASH" && rule.answer?.cashPhotos
              ? Object.fromEntries(
                  Object.entries(rule.answer.cashPhotos).map(([key, value]) => [
                    key,
                    {
                      photoS3Key: value?.photoS3Key ?? null,
                      photoUrl: value?.photoUrl ?? null,
                      photoPreviewUrl: value?.photoUrl ?? null,
                    },
                  ]),
                )
              : {}

          nextAnswers[rule.id] = {
            inputValue: rule.answer?.inputValue ?? "",
            cashValues,
            cashPhotos,
            checklist: checklistState,
            photoS3Key: rule.answer?.photoDeletedAt ? null : rule.answer?.photoS3Key ?? null,
            photoUrl: rule.answer?.photoDeletedAt ? null : rule.answer?.photoUrl ?? null,
            photoPreviewUrl: rule.answer?.photoDeletedAt ? null : rule.answer?.photoUrl ?? null,
            photoComment: rule.answer?.photoComment ?? "",
          }
        }
        setAnswers(nextAnswers)
      }
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err?.message || "Не удалось загрузить процедуры",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshData()
  }, [intervalId, whenParam])

  useEffect(() => {
    if (!isOpenInProgress) return
    const id = window.setInterval(() => setNowTimestamp(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [isOpenInProgress])

  const rules = procedure?.rules ?? []
  const visibleRules = useMemo(() => {
    if (!isOpenInProgress) return rules
    return rules.filter((rule) => !rule.required)
  }, [isOpenInProgress, rules])
  const requiredRules = rules.filter((rule) => rule.required)
  const completedRequired = requiredRules.filter((rule) => isRuleComplete(rule, answers[rule.id])).length
  const requiredTotal = requiredRules.length
  const progressValue = requiredTotal > 0 ? Math.round((completedRequired / requiredTotal) * 100) : 100
  const hasBlockingCashPhotoMissing = rules.some(
    (rule) =>
      rule.type === "CASH" &&
      !rule.cashLocked &&
      rule.cashFields.some((field) => isCashFieldPhotoMissing(rule, field.key, answers[rule.id])),
  )

  const canOpen =
    whenParam === "OPEN" &&
    completedRequired === requiredTotal &&
    !hasBlockingCashPhotoMissing &&
    interval?.status === "scheduled"
  const canClose =
    whenParam === "CLOSE" &&
    completedRequired === requiredTotal &&
    !hasBlockingCashPhotoMissing &&
    interval?.status === "in_progress"

  const updateAnswerState = (ruleId: string, next: Partial<RuleAnswerState>) => {
    setAnswers((prev) => ({
      ...prev,
      [ruleId]: {
        inputValue: prev[ruleId]?.inputValue ?? "",
        cashValues: prev[ruleId]?.cashValues ?? {},
        cashPhotos: prev[ruleId]?.cashPhotos ?? {},
        checklist: prev[ruleId]?.checklist ?? {},
        photoS3Key: prev[ruleId]?.photoS3Key ?? null,
        photoUrl: prev[ruleId]?.photoUrl ?? null,
        photoPreviewUrl: prev[ruleId]?.photoPreviewUrl ?? null,
        photoComment: prev[ruleId]?.photoComment ?? "",
        ...next,
      },
    }))
  }

  const saveAnswers = async () => {
    if (!procedure) return false
    setIsSaving(true)
    try {
      const cashInputByRuleId = new Map<string, string>()
      for (const rule of procedure.rules) {
        if (rule.type !== "CASH") continue
        const packed = encodeCashProcedureValues(
          rule.cashFields.map((field) => field.key),
          answers[rule.id]?.cashValues ?? {},
        )
        if (packed.length > 150) {
          throw new Error(
            `Слишком много данных в кассе для правила «${rule.title}». Сократите количество заполненных полей или их значения.`,
          )
        }
        cashInputByRuleId.set(rule.id, packed)
      }

      const payload = {
        when: procedure.when,
        answers: procedure.rules.map((rule) => ({
          ruleId: rule.id,
          type: rule.type,
          inputValue:
            rule.type === "INPUT"
              ? (answers[rule.id]?.inputValue ?? "").slice(0, 150)
              : rule.type === "CASH"
                ? cashInputByRuleId.get(rule.id) ?? ""
                : null,
          cashPhotos:
            rule.type === "CASH"
              ? (() => {
                  const normalized: Record<string, { photoS3Key: string | null; photoUrl: string | null }> = {}
                  const source = answers[rule.id]?.cashPhotos ?? ({} as RuleAnswerState["cashPhotos"])
                  for (const [key, value] of Object.entries(source)) {
                    const photoS3Key = value?.photoS3Key ?? null
                    const photoUrl = value?.photoUrl ?? null
                    if (!photoS3Key && !photoUrl) continue
                    normalized[key] = { photoS3Key, photoUrl }
                  }
                  return normalized
                })()
              : undefined,
          photoS3Key: answers[rule.id]?.photoS3Key ?? null,
          photoUrl: answers[rule.id]?.photoUrl ?? null,
          photoComment: (answers[rule.id]?.photoComment ?? "").trim() || null,
          checklistItems: rule.type === "CHECKLIST"
            ? rule.checklistItems.map((item) => ({
                itemId: item.id,
                isChecked: answers[rule.id]?.checklist?.[item.id] ?? false,
              }))
            : undefined,
        })),
      }

      const res = await fetch(`/api/work-intervals/${intervalId}/procedures/answers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "Не удалось сохранить")
      }
      toast({ title: "Сохранено", description: "Ответы сохранены" })
      await refreshData()
      return true
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err?.message || "Не удалось сохранить",
        variant: "destructive",
      })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const attemptAction = async (options?: { force?: boolean; reason?: string }) => {
    const isForce = options?.force === true
    if (!isForce) {
      if (whenParam === "OPEN" && !canOpen) return
      if (whenParam === "CLOSE" && !canClose) return
    }
    setIsSubmitting(true)
    try {
      const saved = await saveAnswers()
      if (!saved) return
      const endpoint = whenParam === "OPEN" ? "open" : "close"
      const payload: { force: boolean; reason?: string } = { force: isForce }
      if (options?.reason?.trim()) {
        payload.reason = options.reason.trim()
      }
      const res = await fetch(`/api/work-intervals/${intervalId}/${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "Операция не выполнена")
      }
      toast({
        title: whenParam === "OPEN" ? "Смена открыта" : "Смена закрыта",
        description: "Статус смены обновлён",
      })
      await refreshData()
      if (whenParam === "CLOSE") {
        router.replace("/app")
      }
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err?.message || "Не удалось выполнить операцию",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const attemptForceAction = async () => {
    const reason = window.prompt("Укажите причину принудительного действия")
    if (!reason || !reason.trim()) {
      toast({
        title: "Нужна причина",
        description: "Для принудительного действия укажите причину.",
        variant: "destructive",
      })
      return
    }
    await attemptAction({ force: true, reason: reason.trim() })
  }

  const handlePhotoCapture = async (target: { ruleId: string; cashFieldKey?: string }, blob: Blob, previewUrl: string) => {
    const uploadKey = toPhotoUploadKey(target.ruleId, target.cashFieldKey)
    setUploadingPhotoKey(uploadKey)
    try {
      const res = await fetch("/api/procedures/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workIntervalId: intervalId,
          ruleId: target.ruleId,
          cashFieldKey: target.cashFieldKey,
          contentType: blob.type || "image/jpeg",
          sizeBytes: blob.size,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "Не удалось получить ссылку для загрузки")
      }
      const { uploadUrl, key, publicUrl } = json.data
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
      })
      if (!uploadRes.ok) {
        throw new Error(`Не удалось загрузить фото (${uploadRes.status})`)
      }

      if (target.cashFieldKey) {
        const fieldKey = target.cashFieldKey
        setAnswers((prev) => ({
          ...prev,
          [target.ruleId]: {
            inputValue: prev[target.ruleId]?.inputValue ?? "",
            cashValues: prev[target.ruleId]?.cashValues ?? {},
            cashPhotos: {
              ...(prev[target.ruleId]?.cashPhotos ?? {}),
              [fieldKey]: {
                photoS3Key: key,
                photoUrl: publicUrl ?? null,
                photoPreviewUrl: publicUrl ?? previewUrl,
              },
            },
            checklist: prev[target.ruleId]?.checklist ?? {},
            photoS3Key: prev[target.ruleId]?.photoS3Key ?? null,
            photoUrl: prev[target.ruleId]?.photoUrl ?? null,
            photoPreviewUrl: prev[target.ruleId]?.photoPreviewUrl ?? null,
            photoComment: prev[target.ruleId]?.photoComment ?? "",
          },
        }))
      } else {
        updateAnswerState(target.ruleId, {
          photoS3Key: key,
          photoUrl: publicUrl ?? null,
          photoPreviewUrl: publicUrl ?? previewUrl,
        })
      }

      toast({ title: "Фото загружено" })
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err?.message || "Не удалось загрузить фото",
        variant: "destructive",
      })
    } finally {
      setUploadingPhotoKey(null)
    }
  }

  const pageTitle = whenParam === "OPEN" ? "Открытие смены" : "Закрытие смены"
  const startedAt = interval?.openedAt ?? interval?.startAt ?? null
  const elapsedSeconds =
    isOpenInProgress && startedAt
      ? Math.max(0, Math.floor((nowTimestamp - new Date(startedAt).getTime()) / 1000))
      : 0
  const elapsedMinutesFromTimer = Math.floor(elapsedSeconds / 60)

  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const pad = (value: number) => value.toString().padStart(2, "0")
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
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

  const payPreview = interval?.payPreview ?? null
  const salaryText = useMemo(() => {
    if (!payPreview) return "—"
    if (payPreview.salaryMessage) return payPreview.salaryMessage
    const currency = payPreview.currency ?? null
    if (isOpenInProgress) {
      const hourlyPart = Math.round(((payPreview.hourlyRateCents ?? 0) * elapsedMinutesFromTimer) / 60)
      const fixedPart = payPreview.fixedShiftRateCents ?? 0
      const total = hourlyPart + fixedPart
      return total > 0 ? formatMoney(total, currency) : "—"
    }
    if (payPreview.estimatedSalaryCents != null) {
      return formatMoney(payPreview.estimatedSalaryCents, currency)
    }
    return "—"
  }, [elapsedMinutesFromTimer, isOpenInProgress, payPreview])

  const actionBlockedMessage =
    whenParam === "OPEN"
      ? hasBlockingCashPhotoMissing
        ? "Для заполненных полей кассы с требованием фото загрузите фото."
        : "Все обязательные поля должны быть заполнены для открытия смены."
      : hasBlockingCashPhotoMissing
        ? "Для заполненных полей кассы с требованием фото загрузите фото."
        : "Все обязательные поля должны быть заполнены для закрытия смены."

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            ←
          </Button>
          <h1 className="text-lg font-semibold">{pageTitle}</h1>
          <div className="w-8" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isLoading && <div className="text-sm text-muted-foreground">Загрузка...</div>}

        {!isLoading && procedure && (
          <>
            {isOpenInProgress && (
              <Card className="p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">В смене</span>
                  <span className="font-semibold">{formatDuration(elapsedSeconds)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Зарплата</span>
                  <span className="font-semibold">{salaryText}</span>
                </div>
              </Card>
            )}

            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Обязательные</span>
                <span className="font-medium">
                  {completedRequired}/{requiredTotal}
                </span>
              </div>
              <Progress value={progressValue} />
              <div className="text-xs text-muted-foreground">
                {completedRequired === requiredTotal
                  ? "Все обязательные правила выполнены"
                  : "Нужно выполнить обязательные правила"}
              </div>
            </Card>

            <div className="space-y-3">
              {visibleRules.length === 0 && (
                <Card className="p-4 text-sm text-muted-foreground">
                  {isOpenInProgress
                    ? "Все необязательные поля открытия уже заполнены."
                    : "Для этого этапа нет правил."}
                </Card>
              )}
              {visibleRules.map((rule) => {
                const state = answers[rule.id]
                const isComplete = isRuleComplete(rule, state)
                return (
                  <Card key={rule.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">
                          {rule.title}
                          {rule.required && <span className="text-destructive"> *</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {rule.type === "CHECKLIST" && "Чеклист"}
                          {rule.type === "INPUT" && "Поле ввода"}
                          {rule.type === "PHOTO" && "Фото"}
                          {rule.type === "CASH" && "Касса"}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-xs px-2 py-1 rounded-full",
                          isComplete ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isComplete ? "Готово" : "Не заполнено"}
                      </span>
                    </div>

                    {rule.type === "CHECKLIST" && (
                      <div className="space-y-2">
                        {rule.checklistItems.map((item) => (
                          <label key={item.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={!!state?.checklist?.[item.id]}
                              onCheckedChange={(checked) =>
                                updateAnswerState(rule.id, {
                                  checklist: {
                                    ...(state?.checklist ?? {}),
                                    [item.id]: Boolean(checked),
                                  },
                                })
                              }
                              disabled={!canEdit}
                            />
                            <span>{item.title}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {rule.type === "INPUT" && (
                      <Input
                        value={state?.inputValue ?? ""}
                        onChange={(event) =>
                          updateAnswerState(rule.id, { inputValue: event.target.value.slice(0, 150) })
                        }
                        maxLength={150}
                        placeholder="Введите значение"
                        disabled={!canEdit}
                      />
                    )}

                    {rule.type === "PHOTO" && (
                      <div className="space-y-2">
                        {rule.answer?.photoDeletedAt && (
                          <div className="text-xs text-muted-foreground">
                            Ранее загруженное фото удалено по политике хранения.
                          </div>
                        )}
                        {state?.photoPreviewUrl ? (
                          <ImagePreview
                            src={state.photoPreviewUrl}
                            alt="Фото"
                            triggerClassName="w-full rounded-lg"
                            imageClassName="w-full h-40 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-32 rounded-lg bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                            Фото не сделано
                          </div>
                        )}
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setCameraTarget({ ruleId: rule.id })}
                          disabled={!canEdit || uploadingPhotoKey === rule.id}
                        >
                          {uploadingPhotoKey === rule.id ? "Загрузка..." : "Сделать фото"}
                        </Button>
                        <Input
                          value={state?.photoComment ?? ""}
                          onChange={(event) =>
                            updateAnswerState(rule.id, {
                              photoComment: event.target.value.slice(0, 300),
                            })
                          }
                          maxLength={300}
                          placeholder="Комментарий к фото (опционально)"
                          disabled={!canEdit}
                        />
                      </div>
                    )}

                    {rule.type === "CASH" && (
                      <div className="space-y-2">
                        {rule.cashLocked && (
                          <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            {rule.cashLockMessage ?? "Значения уже установлены для этого рабочего дня"}
                          </div>
                        )}

                        {rule.cashFields.length > 0 ? (
                          <div className="space-y-2">
                            {rule.cashFields.map((cashField) => {
                              const valueToken = state?.cashValues?.[cashField.key] ?? ""
                              const hasValue = isCashIntegerToken(valueToken)
                              const photoState = state?.cashPhotos?.[cashField.key]
                              const hasPhoto = Boolean(photoState?.photoS3Key || photoState?.photoUrl)
                              const requiresPhoto = Boolean(cashField.isPhotoRequired)
                              const isPhotoMissing = !rule.cashLocked && isCashFieldPhotoMissing(rule, cashField.key, state)
                              const fieldUploadKey = toPhotoUploadKey(rule.id, cashField.key)

                              return (
                                <div key={cashField.key} className="space-y-2 rounded-md border border-border/60 p-2">
                                  <div className="text-xs font-medium">
                                    {cashField.label}
                                    {cashField.isRequired && <span className="text-destructive"> *</span>}
                                    {requiresPhoto && (
                                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                                        Фото
                                      </span>
                                    )}
                                  </div>

                                  <Input
                                    value={valueToken}
                                    onChange={(event) => {
                                      const nextValue = event.target.value.trim()
                                      if (!isCashIntegerDraftToken(nextValue)) return

                                      updateAnswerState(rule.id, {
                                        cashValues: {
                                          ...(state?.cashValues ?? {}),
                                          [cashField.key]: nextValue,
                                        },
                                      })
                                    }}
                                    className={cn(
                                      isPhotoMissing && "border-destructive focus-visible:ring-destructive",
                                    )}
                                    inputMode="numeric"
                                    placeholder="Введите целое число"
                                    disabled={!canEdit || rule.cashLocked}
                                  />

                                  {requiresPhoto && (
                                    <div className="space-y-2">
                                      {photoState?.photoPreviewUrl ? (
                                        <ImagePreview
                                          src={photoState.photoPreviewUrl}
                                          alt={`Фото для поля ${cashField.label}`}
                                          triggerClassName="w-full rounded-md"
                                          imageClassName="h-24 w-full rounded-md object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-20 items-center justify-center rounded-md bg-muted/40 text-xs text-muted-foreground">
                                          Фото не загружено
                                        </div>
                                      )}

                                      <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => setCameraTarget({ ruleId: rule.id, cashFieldKey: cashField.key })}
                                        disabled={!canEdit || rule.cashLocked || !hasValue || uploadingPhotoKey === fieldUploadKey}
                                      >
                                        {uploadingPhotoKey === fieldUploadKey
                                          ? "Загрузка..."
                                          : hasPhoto
                                            ? "Переснять фото"
                                            : "Сделать фото"}
                                      </Button>

                                      {!hasValue && (
                                        <div className="text-xs text-muted-foreground">
                                          Введите значение, затем загрузите фото.
                                        </div>
                                      )}

                                      {isPhotoMissing && (
                                        <div className="text-xs text-destructive">
                                          Для заполненного поля требуется фото.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            В настройках кассы не задано полей для этого этапа.
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>

            <div className="space-y-2">
              <Button className="w-full" onClick={saveAnswers} disabled={isSaving || !canEdit}>
                {isSaving ? "Сохранение..." : "Сохранить"}
              </Button>
              {whenParam === "OPEN" && interval?.status === "scheduled" && (
                <>
                  {!canOpen && (
                    <div className="text-xs text-destructive">{actionBlockedMessage}</div>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => {
                      void attemptAction()
                    }}
                    disabled={isSubmitting || !canOpen}
                  >
                    {isSubmitting ? "Проверка..." : "Открыть смену"}
                  </Button>
                  {!canOpen && interval?.canForce && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={attemptForceAction}
                      disabled={isSubmitting}
                    >
                      Принудительно открыть (владелец)
                    </Button>
                  )}
                </>
              )}
              {whenParam === "OPEN" && interval?.status === "in_progress" && (
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={() => router.replace(`/shift-procedures/${intervalId}?when=CLOSE`)}
                >
                  Перейти к закрытию смены
                </Button>
              )}
              {whenParam === "CLOSE" && (
                <>
                  {!canClose && interval?.status === "in_progress" && (
                    <div className="text-xs text-destructive">{actionBlockedMessage}</div>
                  )}
                  <Button
                    className="w-full"
                    variant="destructive"
                    onClick={() => {
                      void attemptAction()
                    }}
                    disabled={isSubmitting || !canClose}
                  >
                    {isSubmitting ? "Проверка..." : "Закрыть смену"}
                  </Button>
                  {!canClose && interval?.canForce && interval?.status === "in_progress" && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={attemptForceAction}
                      disabled={isSubmitting}
                    >
                      Принудительно закрыть (владелец)
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {!isLoading && !procedure && (
          <Card className="p-4 text-sm text-muted-foreground">Правила для этой смены не настроены.</Card>
        )}
      </div>

      <CameraCaptureDialog
        open={!!cameraTarget}
        onOpenChange={(open) => {
          if (!open) setCameraTarget(null)
        }}
        onCapture={(blob, previewUrl) => {
          if (cameraTarget) {
            void handlePhotoCapture(cameraTarget, blob, previewUrl)
          }
        }}
      />
    </div>
  )
}
