"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { MessageSquareText } from "lucide-react"
import { ImagePreview } from "@/components/ui/image-preview"
import { useToast } from "@/hooks/use-toast"
import { roundPayrollHourlyMinutes } from "@/lib/payroll/interval-compensation"
import { shouldRedirectToAppAfterProcedureAction } from "@/lib/procedures/navigation"
import { cn } from "@/lib/utils"
import {
  decodeCashProcedureValues,
  encodeCashProcedureValues,
  isCashIntegerDraftToken,
  isCashIntegerToken,
} from "@/lib/cash/procedure-values"
import { useTranslation } from "@/lib/i18n/context"

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
  cashClosePolicy?: {
    canSkip: boolean
    reason?: string | null
    remainingCashEmployees?: number
  } | null
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

type DraftRuleAnswerState = {
  inputValue?: string
  cashValues?: Record<string, string>
  cashPhotos?: Record<string, { photoS3Key: string | null; photoUrl: string | null }>
  checklist?: Record<string, boolean>
  photoS3Key?: string | null
  photoUrl?: string | null
  photoComment?: string
}

type ProcedureDraftPayload = {
  version: 1
  savedAt: number
  answers: Record<string, DraftRuleAnswerState>
}

const PROCEDURE_DRAFT_STORAGE_PREFIX = "crewlly:shift-procedure-draft:v1"
const PROCEDURE_DRAFT_TTL_MS = 1000 * 60 * 60 * 12
const HANDOFF_NOTE_MAX_LENGTH = 500

type HandoffNote = {
  id: string
  text: string
  authorClosedAt: string
  authorFullName: string | null
}

const getProcedureDraftStorageKey = (intervalId: string, when: ProcedureWhen) =>
  `${PROCEDURE_DRAFT_STORAGE_PREFIX}:${intervalId}:${when}`

const toDraftAnswers = (answers: Record<string, RuleAnswerState>): Record<string, DraftRuleAnswerState> =>
  Object.fromEntries(
    Object.entries(answers).map(([ruleId, state]) => [
      ruleId,
      {
        inputValue: state.inputValue,
        cashValues: state.cashValues,
        cashPhotos: Object.fromEntries(
          Object.entries(state.cashPhotos).map(([fieldKey, photo]) => [
            fieldKey,
            {
              photoS3Key: photo?.photoS3Key ?? null,
              photoUrl: photo?.photoUrl ?? null,
            },
          ]),
        ),
        checklist: state.checklist,
        photoS3Key: state.photoS3Key,
        photoUrl: state.photoUrl,
        photoComment: state.photoComment,
      },
    ]),
  )

const hasMeaningfulDraftData = (answers: Record<string, DraftRuleAnswerState>) =>
  Object.values(answers).some((state) => {
    if ((state.inputValue ?? "").trim()) return true
    if ((state.photoComment ?? "").trim()) return true
    if (state.photoS3Key || state.photoUrl) return true
    if (Object.values(state.cashValues ?? {}).some((value) => value.trim().length > 0)) return true
    if (Object.values(state.checklist ?? {}).some(Boolean)) return true
    return Object.values(state.cashPhotos ?? {}).some((photo) => Boolean(photo?.photoS3Key || photo?.photoUrl))
  })

const readProcedureDraftFromStorage = (storageKey: string): Record<string, DraftRuleAnswerState> | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<ProcedureDraftPayload>
    if (!parsed || typeof parsed !== "object" || !parsed.answers || typeof parsed.answers !== "object") {
      window.localStorage.removeItem(storageKey)
      return null
    }

    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > PROCEDURE_DRAFT_TTL_MS) {
      window.localStorage.removeItem(storageKey)
      return null
    }

    return parsed.answers as Record<string, DraftRuleAnswerState>
  } catch {
    window.localStorage.removeItem(storageKey)
    return null
  }
}

const mergeAnswersWithDraft = (
  baseAnswers: Record<string, RuleAnswerState>,
  draftAnswers: Record<string, DraftRuleAnswerState> | null,
) => {
  if (!draftAnswers) return baseAnswers

  const nextAnswers: Record<string, RuleAnswerState> = { ...baseAnswers }

  for (const [ruleId, draft] of Object.entries(draftAnswers)) {
    if (!draft || typeof draft !== "object") continue
    const base = nextAnswers[ruleId]
    if (!base) continue

    const safeCashValues: Record<string, string> = Object.fromEntries(
      Object.entries(draft.cashValues ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    )
    const safeChecklist: Record<string, boolean> = Object.fromEntries(
      Object.entries(draft.checklist ?? {}).map(([key, value]) => [key, Boolean(value)]),
    )
    const safeCashPhotos: RuleAnswerState["cashPhotos"] = Object.fromEntries(
      Object.entries(draft.cashPhotos ?? {})
        .filter((entry) => Boolean(entry[1]) && typeof entry[1] === "object")
        .map(([fieldKey, photo]) => [
          fieldKey,
          {
            photoS3Key: typeof photo?.photoS3Key === "string" ? photo.photoS3Key : null,
            photoUrl: typeof photo?.photoUrl === "string" ? photo.photoUrl : null,
            photoPreviewUrl: typeof photo?.photoUrl === "string" ? photo.photoUrl : null,
          },
        ]),
    )

    const draftPhotoUrl = typeof draft.photoUrl === "string" ? draft.photoUrl : draft.photoUrl === null ? null : undefined
    const draftPhotoS3Key =
      typeof draft.photoS3Key === "string" ? draft.photoS3Key : draft.photoS3Key === null ? null : undefined

    nextAnswers[ruleId] = {
      ...base,
      inputValue: typeof draft.inputValue === "string" ? draft.inputValue : base.inputValue,
      cashValues: { ...base.cashValues, ...safeCashValues },
      cashPhotos: { ...base.cashPhotos, ...safeCashPhotos },
      checklist: { ...base.checklist, ...safeChecklist },
      photoS3Key: draftPhotoS3Key === undefined ? base.photoS3Key : draftPhotoS3Key,
      photoUrl: draftPhotoUrl === undefined ? base.photoUrl : draftPhotoUrl,
      photoPreviewUrl: draftPhotoUrl === undefined ? base.photoPreviewUrl : draftPhotoUrl,
      photoComment: typeof draft.photoComment === "string" ? draft.photoComment : base.photoComment,
    }
  }

  return nextAnswers
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

const isCashComplete = (rule: ProcedureRule, state?: RuleAnswerState, options?: { skipped?: boolean }) => {
  if (options?.skipped) return true
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

const isRuleComplete = (rule: ProcedureRule, state?: RuleAnswerState, options?: { skipCloseCash?: boolean }) => {
  if (rule.type === "CHECKLIST") return isChecklistComplete(rule, state)
  if (rule.type === "INPUT") return isInputComplete(state)
  if (rule.type === "PHOTO") return isPhotoComplete(state)
  if (rule.type === "CASH") return isCashComplete(rule, state, { skipped: options?.skipCloseCash })
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
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let active = true
    setError(null)

    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined
    if (!mediaDevices?.getUserMedia) {
      const message = window.isSecureContext
        ? t("shift_camera_unavailable_browser")
        : t("shift_camera_unavailable_https")
      setError(message)
      return
    }

    mediaDevices
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
      .catch(() => setError(t("shift_camera_access_error")))

    return () => {
      active = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [open])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const previewUrl = URL.createObjectURL(file)
    onCapture(file, previewUrl)
    onOpenChange(false)
    event.target.value = ""
  }

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
            <div className="space-y-3">
              <div className="text-sm text-destructive">{error}</div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                Выбрать фото
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
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
  const { t, language } = useTranslation()
  const whenParam = (searchParams.get("when") || "OPEN") as ProcedureWhen
  const draftStorageKey = useMemo(() => getProcedureDraftStorageKey(intervalId, whenParam), [intervalId, whenParam])

  const [interval, setInterval] = useState<IntervalInfo | null>(null)
  const [procedure, setProcedure] = useState<ProcedureData | null>(null)
  const [answers, setAnswers] = useState<Record<string, RuleAnswerState>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [skipCloseCash, setSkipCloseCash] = useState(false)
  const [cameraTarget, setCameraTarget] = useState<{ ruleId: string; cashFieldKey?: string } | null>(null)
  const [uploadingPhotoKey, setUploadingPhotoKey] = useState<string | null>(null)
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())
  const lastDraftSnapshotRef = useRef<string | null>(null)

  const [handoffDialogOpen, setHandoffDialogOpen] = useState(false)
  const [handoffNoteText, setHandoffNoteText] = useState("")
  const [isSubmittingHandoff, setIsSubmittingHandoff] = useState(false)
  const [incomingHandoffNotes, setIncomingHandoffNotes] = useState<HandoffNote[]>([])
  const [isAcknowledgingHandoff, setIsAcknowledgingHandoff] = useState(false)
  const toPhotoUploadKey = (ruleId: string, cashFieldKey?: string) => (cashFieldKey ? `${ruleId}:${cashFieldKey}` : ruleId)

  const canEdit = interval ? !["completed", "canceled"].includes(interval.status) : true
  const isOpenInProgress = whenParam === "OPEN" && interval?.status === "in_progress"

  const clearDraftCache = () => {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(draftStorageKey)
    lastDraftSnapshotRef.current = null
  }

  const refreshData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/work-intervals/${intervalId}/procedures?when=${whenParam}`, {
        credentials: "include",
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || t("shift_load_procedures_error"))
      }
      const procedures = json?.data?.procedures ?? []
      const nextProcedure = procedures[0] ?? null
      const nextInterval = (json?.data?.interval ?? null) as IntervalInfo | null
      const nextCanEdit = nextInterval ? !["completed", "canceled"].includes(nextInterval.status) : true
      setInterval(nextInterval)
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
        if (!nextCanEdit && typeof window !== "undefined") {
          window.localStorage.removeItem(draftStorageKey)
        }
        const mergedAnswers = nextCanEdit
          ? mergeAnswersWithDraft(nextAnswers, readProcedureDraftFromStorage(draftStorageKey))
          : nextAnswers
        const mergedDraftSnapshot = toDraftAnswers(mergedAnswers)
        lastDraftSnapshotRef.current = hasMeaningfulDraftData(mergedDraftSnapshot) ? JSON.stringify(mergedDraftSnapshot) : null
        setAnswers(mergedAnswers)
      }
    } catch (err: any) {
      toast({
        title: t("common_error"),
        description: err?.message || t("shift_load_procedures_error"),
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshData()
  }, [draftStorageKey, intervalId, whenParam])

  useEffect(() => {
    lastDraftSnapshotRef.current = null
  }, [draftStorageKey])

  useEffect(() => {
    if (whenParam !== "CLOSE" || !procedure?.cashClosePolicy?.canSkip) {
      setSkipCloseCash(false)
    }
  }, [procedure?.cashClosePolicy?.canSkip, procedure?.id, whenParam])

  useEffect(() => {
    if (!isOpenInProgress) return
    const id = window.setInterval(() => setNowTimestamp(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [isOpenInProgress])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!procedure || isLoading || !canEdit) return

    const timeoutId = window.setTimeout(() => {
      const draftAnswers = toDraftAnswers(answers)

      if (!hasMeaningfulDraftData(draftAnswers)) {
        window.localStorage.removeItem(draftStorageKey)
        lastDraftSnapshotRef.current = null
        return
      }

      const nextSnapshot = JSON.stringify(draftAnswers)
      if (nextSnapshot === lastDraftSnapshotRef.current) return

      const payload: ProcedureDraftPayload = {
        version: 1,
        savedAt: Date.now(),
        answers: draftAnswers,
      }

      window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
      lastDraftSnapshotRef.current = nextSnapshot
    }, 400)

    return () => window.clearTimeout(timeoutId)
  }, [answers, canEdit, draftStorageKey, isLoading, procedure])

  const rules = procedure?.rules ?? []
  const visibleRules = useMemo(() => {
    if (!isOpenInProgress) return rules
    return rules.filter((rule) => !rule.required)
  }, [isOpenInProgress, rules])
  const firstVisibleCashRuleId = useMemo(
    () => visibleRules.find((rule) => rule.type === "CASH")?.id ?? null,
    [visibleRules],
  )
  const closeCashPolicy = whenParam === "CLOSE" ? procedure?.cashClosePolicy ?? null : null
  const isCloseCashSkipActive = Boolean(closeCashPolicy?.canSkip && skipCloseCash)
  const requiredRules = rules.filter((rule) => rule.required)
  const completedRequired = requiredRules.filter((rule) =>
    isRuleComplete(rule, answers[rule.id], { skipCloseCash: rule.type === "CASH" && isCloseCashSkipActive }),
  ).length
  const requiredTotal = requiredRules.length
  const progressValue = requiredTotal > 0 ? Math.round((completedRequired / requiredTotal) * 100) : 100
  const hasBlockingCashPhotoMissing = rules.some(
    (rule) =>
      rule.type === "CASH" &&
      !isCloseCashSkipActive &&
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

  const saveAnswers = async (options?: { silentSuccess?: boolean; refreshAfterSave?: boolean; skipCash?: boolean }) => {
    if (!procedure) return false
    const silentSuccess = options?.silentSuccess === true
    const refreshAfterSave = options?.refreshAfterSave !== false
    const skipCash = options?.skipCash === true && procedure.when === "CLOSE"
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
                ? skipCash && !rule.cashLocked
                  ? ""
                  : cashInputByRuleId.get(rule.id) ?? ""
                : null,
          cashPhotos:
            rule.type === "CASH"
              ? skipCash && !rule.cashLocked
                ? {}
                : (() => {
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
        throw new Error(json?.error || t("shift_save_answers_error"))
      }
      if (!silentSuccess) {
        toast({ title: t("shift_answers_saved"), description: t("shift_answers_saved_desc") })
      }
      if (refreshAfterSave) {
        await refreshData()
      }
      return true
    } catch (err: any) {
      toast({
        title: t("common_error"),
        description: err?.message || t("shift_save_answers_error"),
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
    const shouldSkipCash = whenParam === "CLOSE" && isCloseCashSkipActive
    setIsSubmitting(true)
    try {
      const saved = await saveAnswers({ silentSuccess: true, refreshAfterSave: false, skipCash: shouldSkipCash })
      if (!saved) return
      const endpoint = whenParam === "OPEN" ? "open" : "close"
      const payload: { force: boolean; reason?: string; skipCash?: boolean } = { force: isForce }
      if (shouldSkipCash) {
        payload.skipCash = true
      }
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
        throw new Error(json?.error || t("shift_operation_failed"))
      }
      toast({
        title: whenParam === "OPEN" ? t("shift_opened_toast") : t("shift_closed_toast"),
        description: t("shift_status_updated"),
      })
      clearDraftCache()

      const isEmployeeActor = interval ? !interval.canForce : true

      if (whenParam === "CLOSE" && isEmployeeActor) {
        setHandoffNoteText("")
        setHandoffDialogOpen(true)
        return
      }

      if (
        shouldRedirectToAppAfterProcedureAction({
          when: whenParam,
          hasManagementAccess: Boolean(interval?.canForce),
        })
      ) {
        router.replace("/app")
        return
      }
      await refreshData()
    } catch (err: any) {
      toast({
        title: t("common_error"),
        description: err?.message || t("shift_operation_error"),
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const closeHandoffDialogAndRedirect = () => {
    setHandoffDialogOpen(false)
    if (
      shouldRedirectToAppAfterProcedureAction({
        when: "CLOSE",
        hasManagementAccess: Boolean(interval?.canForce),
      })
    ) {
      router.replace("/app")
      return
    }
    void refreshData()
  }

  const submitHandoffNote = async () => {
    const trimmed = handoffNoteText.trim()
    if (!trimmed) {
      closeHandoffDialogAndRedirect()
      return
    }
    setIsSubmittingHandoff(true)
    try {
      const res = await fetch(`/api/work-intervals/${intervalId}/handoff-notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed.slice(0, HANDOFF_NOTE_MAX_LENGTH) }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || t("shift_save_handoff_error"))
      }
      toast({ title: t("shift_handoff_saved"), description: t("shift_handoff_saved_desc") })
      closeHandoffDialogAndRedirect()
    } catch (err: any) {
      toast({
        title: t("common_error"),
        description: err?.message || t("shift_save_handoff_error"),
        variant: "destructive",
      })
    } finally {
      setIsSubmittingHandoff(false)
    }
  }

  const skipHandoffNote = () => {
    closeHandoffDialogAndRedirect()
  }

  const loadIncomingHandoffNotes = async () => {
    try {
      const res = await fetch(`/api/work-intervals/${intervalId}/handoff-notes`, {
        credentials: "include",
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) return
      const notes = (json?.data?.notes ?? []) as HandoffNote[]
      setIncomingHandoffNotes(notes)
    } catch {
      // silent — a failed fetch should not block the open flow
    }
  }

  const acknowledgeIncomingHandoffNotes = async () => {
    if (incomingHandoffNotes.length === 0) return
    const noteIds = incomingHandoffNotes.map((note) => note.id)
    setIsAcknowledgingHandoff(true)
    try {
      await fetch(`/api/work-intervals/${intervalId}/handoff-notes/acknowledge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds }),
      })
    } catch {
      // swallow — user already saw the notes
    } finally {
      setIsAcknowledgingHandoff(false)
      setIncomingHandoffNotes([])
    }
  }

  useEffect(() => {
    if (whenParam !== "OPEN") {
      setIncomingHandoffNotes([])
      return
    }
    if (!interval || interval.status !== "scheduled") {
      setIncomingHandoffNotes([])
      return
    }
    void loadIncomingHandoffNotes()

  }, [whenParam, interval?.status, intervalId])

  const attemptForceAction = async () => {
    const reason = window.prompt(t("shift_force_reason_prompt"))
    if (!reason || !reason.trim()) {
      toast({
        title: t("shift_force_reason_required_title"),
        description: t("shift_force_reason_required_desc"),
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
        throw new Error(json?.error || t("shift_upload_url_error"))
      }
      const { uploadUrl, key, publicUrl, contentType } = json.data
      const uploadContentType =
        typeof contentType === "string" && contentType.trim().length > 0
          ? contentType
          : blob.type || "image/jpeg"
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": uploadContentType },
        body: blob,
      })
      if (!uploadRes.ok) {
        const uploadErrorText = (await uploadRes.text().catch(() => "")).trim()
        const shortErrorText = uploadErrorText.replace(/\s+/g, " ").slice(0, 180)
        throw new Error(
          shortErrorText
            ? `Не удалось загрузить фото (${uploadRes.status}): ${shortErrorText}`
            : `Не удалось загрузить фото (${uploadRes.status})`,
        )
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

      toast({ title: t("shift_photo_uploaded") })
    } catch (err: any) {
      toast({
        title: t("common_error"),
        description: err?.message || t("shift_photo_upload_error"),
        variant: "destructive",
      })
    } finally {
      setUploadingPhotoKey(null)
    }
  }

  const pageTitle = whenParam === "OPEN" ? t("shift_open_title") : t("shift_close_title")
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
    const locale = language === "en" ? "en-US" : "ru-RU"
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

  const payPreview = interval?.payPreview ?? null
  const salaryText = useMemo(() => {
    if (!payPreview) return "—"
    if (payPreview.salaryMessage) return payPreview.salaryMessage
    const currency = payPreview.currency ?? null
    if (isOpenInProgress) {
      const roundedHourlyMinutes = roundPayrollHourlyMinutes(elapsedMinutesFromTimer)
      const hourlyPart = Math.round(((payPreview.hourlyRateCents ?? 0) * roundedHourlyMinutes) / 60)
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
        ? t("shift_blocked_photo_required")
        : t("shift_blocked_open")
      : hasBlockingCashPhotoMissing
        ? t("shift_blocked_photo_required")
        : t("shift_blocked_close")

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              ←
            </Button>
            <h1 className="text-xl font-semibold">{pageTitle}</h1>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isLoading && <div className="text-sm text-muted-foreground">{t("common_loading")}</div>}

        {!isLoading && procedure && (
          <>
            {isOpenInProgress && (
              <Card className="p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("shift_in_progress")}</span>
                  <span className="font-semibold">{formatDuration(elapsedSeconds)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("employee_profile_salary")}</span>
                  <span className="font-semibold">{salaryText}</span>
                </div>
              </Card>
            )}

            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("shift_required")}</span>
                <span className="font-medium">
                  {completedRequired}/{requiredTotal}
                </span>
              </div>
              <Progress value={progressValue} />
              <div className="text-xs text-muted-foreground">
                {completedRequired === requiredTotal
                  ? t("shift_all_required_done")
                  : t("shift_required_pending")}
              </div>
            </Card>

            <div className="space-y-3">
              {visibleRules.length === 0 && (
                <Card className="p-4 text-sm text-muted-foreground">
                  {isOpenInProgress
                    ? t("shift_optional_filled")
                    : t("shift_no_rules")}
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
                          {rule.type === "CHECKLIST" && t("shift_rule_checklist")}
                          {rule.type === "INPUT" && t("shift_rule_input")}
                          {rule.type === "PHOTO" && t("shift_rule_photo")}
                          {rule.type === "CASH" && t("shift_rule_cash")}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-xs px-2 py-1 rounded-full",
                          isComplete ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isComplete ? t("shift_rule_done") : t("shift_rule_pending")}
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
                        placeholder={t("shift_input_placeholder")}
                        disabled={!canEdit}
                      />
                    )}

                    {rule.type === "PHOTO" && (
                      <div className="space-y-2">
                        {rule.answer?.photoDeletedAt && (
                          <div className="text-xs text-muted-foreground">
                            {t("shift_photo_deleted")}
                          </div>
                        )}
                        {state?.photoPreviewUrl ? (
                          <ImagePreview
                            src={state.photoPreviewUrl}
                            alt={t("shift_rule_photo")}
                            triggerClassName="w-full rounded-lg"
                            imageClassName="w-full h-40 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-32 rounded-lg bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                            {t("shift_photo_not_taken")}
                          </div>
                        )}
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setCameraTarget({ ruleId: rule.id })}
                          disabled={!canEdit || uploadingPhotoKey === rule.id}
                        >
                          {uploadingPhotoKey === rule.id ? t("shift_photo_uploading") : t("shift_take_photo")}
                        </Button>
                        <Input
                          value={state?.photoComment ?? ""}
                          onChange={(event) =>
                            updateAnswerState(rule.id, {
                              photoComment: event.target.value.slice(0, 300),
                            })
                          }
                          maxLength={300}
                          placeholder={t("shift_photo_comment_placeholder")}
                          disabled={!canEdit}
                        />
                      </div>
                    )}

                    {rule.type === "CASH" && (
                      <div className="space-y-2">
                        {whenParam === "CLOSE" && rule.id === firstVisibleCashRuleId && closeCashPolicy && !rule.cashLocked && (
                          closeCashPolicy.canSkip ? (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="text-sm font-medium text-amber-950">{t("shift_cash_next_worker")}</div>
                                  <div className="text-xs text-amber-900/80">
                                    {t("shift_cash_next_worker_desc")}
                                  </div>
                                </div>
                                <Switch
                                  checked={skipCloseCash}
                                  onCheckedChange={(checked) => setSkipCloseCash(checked === true)}
                                  disabled={!canEdit}
                                  aria-label={t("shift_cash_next_worker")}
                                />
                              </div>
                              {isCloseCashSkipActive && (
                                <div className="mt-2 text-xs text-amber-900/80">
                                  {t("shift_cash_skip_note")}
                                </div>
                              )}
                            </div>
                          ) : closeCashPolicy.reason ? (
                            <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                              {t("shift_cash_last_employee")}
                            </div>
                          ) : null
                        )}

                        {rule.cashLocked && (
                          <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            {rule.cashLockMessage ?? t("shift_cash_locked")}
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
                              const isPhotoMissing =
                                !rule.cashLocked &&
                                !isCloseCashSkipActive &&
                                isCashFieldPhotoMissing(rule, cashField.key, state)
                              const fieldUploadKey = toPhotoUploadKey(rule.id, cashField.key)
                              const isCashInputDisabled = !canEdit || rule.cashLocked || isCloseCashSkipActive

                              return (
                                <div key={cashField.key} className="space-y-2 rounded-md border border-border/60 p-2">
                                  <div className="text-xs font-medium">
                                    {cashField.label}
                                    {cashField.isRequired && <span className="text-destructive"> *</span>}
                                    {requiresPhoto && (
                                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                                        {t("shift_cash_photo_badge")}
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
                                    placeholder={t("shift_cash_number_placeholder")}
                                    disabled={isCashInputDisabled}
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
                                          {t("shift_cash_photo_not_loaded")}
                                        </div>
                                      )}

                                      <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => setCameraTarget({ ruleId: rule.id, cashFieldKey: cashField.key })}
                                        disabled={isCashInputDisabled || !hasValue || uploadingPhotoKey === fieldUploadKey}
                                      >
                                        {uploadingPhotoKey === fieldUploadKey
                                          ? t("shift_photo_uploading")
                                          : hasPhoto
                                            ? t("shift_cash_retake_photo")
                                            : t("shift_take_photo")}
                                      </Button>

                                      {!hasValue && !isCloseCashSkipActive && (
                                        <div className="text-xs text-muted-foreground">
                                          {t("shift_cash_enter_then_photo")}
                                        </div>
                                      )}

                                      {isPhotoMissing && (
                                        <div className="text-xs text-destructive">
                                          {t("shift_cash_photo_required")}
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
                            {t("shift_cash_no_fields")}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>

            <div className="space-y-2">
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
                    {isSubmitting ? t("shift_checking") : t("shift_open_action")}
                  </Button>
                  {!canOpen && interval?.canForce && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={attemptForceAction}
                      disabled={isSubmitting}
                    >
                      {t("shift_force_open")}
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
                  {t("shift_go_to_close")}
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
                    {isSubmitting ? t("shift_checking") : t("shift_close_action")}
                  </Button>
                  {!canClose && interval?.canForce && interval?.status === "in_progress" && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={attemptForceAction}
                      disabled={isSubmitting}
                    >
                      {t("shift_force_close")}
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {!isLoading && !procedure && (
          <Card className="p-4 text-sm text-muted-foreground">{t("shift_no_rules_configured")}</Card>
        )}
      </div>

      {whenParam === "OPEN" && incomingHandoffNotes.length > 0 && (
        <div className="p-4 space-y-3">
          {incomingHandoffNotes.map((note) => (
            <Card key={note.id} className="p-4 space-y-3 border-primary/30 bg-primary/5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <MessageSquareText className="h-5 w-5 text-primary" strokeWidth={1.5} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-semibold">{t("shift_handoff_from_prev")}</div>
                  {note.authorFullName && (
                    <div className="text-xs text-muted-foreground">{t("shift_handoff_from", { name: note.authorFullName })}</div>
                  )}
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{note.text}</p>
            </Card>
          ))}
          <Button
            className="w-full"
            onClick={() => void acknowledgeIncomingHandoffNotes()}
            disabled={isAcknowledgingHandoff}
          >
            {isAcknowledgingHandoff ? t("shift_handoff_saving") : t("shift_handoff_acknowledge")}
          </Button>
        </div>
      )}

      <Dialog
        open={handoffDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmittingHandoff) {
            skipHandoffNote()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-primary" strokeWidth={1.5} />
              {t("shift_handoff_title")}
            </DialogTitle>
            <DialogDescription>
              {t("shift_handoff_desc")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={t("shift_handoff_placeholder")}
            value={handoffNoteText}
            onChange={(event) => setHandoffNoteText(event.target.value.slice(0, HANDOFF_NOTE_MAX_LENGTH))}
            rows={5}
            maxLength={HANDOFF_NOTE_MAX_LENGTH}
            disabled={isSubmittingHandoff}
          />
          <div className="text-xs text-muted-foreground text-right">
            {handoffNoteText.length}/{HANDOFF_NOTE_MAX_LENGTH}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              onClick={() => void submitHandoffNote()}
              disabled={isSubmittingHandoff || !handoffNoteText.trim()}
            >
              {isSubmittingHandoff ? t("shift_handoff_saving") : t("common_save")}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={skipHandoffNote}
              disabled={isSubmittingHandoff}
            >
              {t("shift_handoff_skip")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
