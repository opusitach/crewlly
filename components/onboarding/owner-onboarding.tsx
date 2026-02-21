"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import timezonesFallback from "@/lib/constants/timezones.json"
import { DEFAULT_TIMEZONE, normalizeTimezone } from "@/lib/validation/timezone"
import {
  ChevronLeft,
  Store,
  Users,
  DollarSign,
  Percent,
  CreditCard,
  CheckCircle2,
  Plus,
  X,
  Clock,
  Banknote,
  TrendingUp,
  AlertCircle,
  GripVertical,
  Trash2,
  ListChecks,
  FileText,
  Camera,
  Type,
  ToggleLeft,
  ImageIcon,
  Copy,
  Pencil,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { FormulaBuilder } from "./formula-builder"
import { TimezoneSelect } from "./timezone-select"
import {
  evaluateFormula,
  extractReferencedFields,
  extractReferencedMetrics,
  type FieldMetaIndex,
  type MetricDefinition,
  type NumericSubtype,
} from "@/lib/utils/formula"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/lib/store/auth-store"

type NumericMode = "INPUT" | "CALCULATED" | "VALIDATE"

type ChecklistField = {
  id: string
  section: "OPEN" | "CLOSE"
  label: string
  type: "text" | "boolean" | "photo" | "number"
  numericSubtype?: NumericSubtype
  numericMode?: NumericMode
  required?: boolean
  placeholder?: string
  metricId?: string
}

type CloseValidationRule = {
  id: string
  name: string
  targetFieldId: string
  expectedSource: { type: "METRIC"; metricId: string } | { type: "EXPRESSION"; expression: string }
  referencedFieldIds: string[]
  referencedMetricIds: string[]
  tolerance?: number
  onMismatch: "WARN" | "BLOCK"
  updatedAt: string
}
type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
type OwnerOnboardingMode = "initial" | "new-venue"
type InviteCodeResponse = {
  data: { code: string | null } | null
  error?: string
}

const INITIAL_OWNER_ONBOARDING_STEPS: OnboardingStep[] = [1, 2, 5]
const NEW_VENUE_ONBOARDING_STEPS: OnboardingStep[] = [1, 2, 3, 4, 5, 6, 7]

export default function OwnerOnboarding({
  onComplete,
  mode = "initial",
}: {
  onComplete: () => void
  mode?: OwnerOnboardingMode
}) {
  const isNewVenueMode = mode === "new-venue"
  const { toast } = useToast()
  const { hydrate: hydrateAuth } = useAuthStore()
  const [isSaving, setIsSaving] = useState(false)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const onboardingSteps = useMemo(
    () => (isNewVenueMode ? NEW_VENUE_ONBOARDING_STEPS : INITIAL_OWNER_ONBOARDING_STEPS),
    [isNewVenueMode],
  )
  const firstStep = onboardingSteps[0] ?? 1
  const lastStep = onboardingSteps[onboardingSteps.length - 1] ?? 7
  const [step, setStep] = useState<OnboardingStep>(firstStep)
  const [venueName, setVenueName] = useState("")
  const [timezone, setTimezone] = useState("")
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>([])
  const [currency, setCurrency] = useState("CZK")

  const [positions, setPositions] = useState<string[]>([])
  const [newPosition, setNewPosition] = useState("")

  const [selectedPaymentTypes, setSelectedPaymentTypes] = useState<string[]>([])
  const [paymentDetails, setPaymentDetails] = useState({
    hourly: "",
    fixed: "",
    percent: "",
  })
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteCodeError, setInviteCodeError] = useState<string | null>(null)
  const [inviteCodeLoading, setInviteCodeLoading] = useState(false)

  const applySnapshot = (data: any) => {
    if (!data) return
    const resolvedOrg = data.organization ?? data
    const resolvedPositions = Array.isArray(data.positions)
      ? data.positions
          .map((pos: any) => (typeof pos === "string" ? pos : pos?.name))
          .filter((pos: string | undefined) => Boolean(pos))
      : positions
    const resolvedTimezone = data.timezone ?? resolvedOrg?.timezone
    setVenueName(data.venueName ?? resolvedOrg?.name ?? "")
    if (resolvedTimezone) setTimezone(resolvedTimezone)
    setCurrency(data.currency ?? resolvedOrg?.currency ?? "CZK")
    setPositions(resolvedPositions.length > 0 ? resolvedPositions : positions)
    setSelectedPaymentTypes(data.selectedPaymentTypes ?? [])
    setPaymentDetails(data.paymentDetails ?? { hourly: "", fixed: "", percent: "" })
    setTipsMode(data.tipsMode ?? "equal")
    setOpeningChecklist(data.openingChecklist ?? openingChecklist)
    setClosingChecklist(data.closingChecklist ?? closingChecklist)
  }

  useEffect(() => {
    const options =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : timezonesFallback
    setTimezoneOptions(options)
  }, [])

  useEffect(() => {
    const detected =
      typeof Intl.DateTimeFormat === "function"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined
    const normalized = normalizeTimezone(detected)
    setTimezone((prev) => prev || normalized || DEFAULT_TIMEZONE)
  }, [])

  useEffect(() => {
    if (!onboardingSteps.includes(step)) {
      setStep(firstStep)
    }
  }, [firstStep, onboardingSteps, step])

  useEffect(() => {
    if (isNewVenueMode) {
      setOrganizationId(null)
      setStep(firstStep)
      return
    }
    const load = async () => {
      const res = await fetch(`/api/onboarding/owner`, { cache: "no-store", credentials: "include" })
      if (res.ok) {
        const json = await res.json()
        applySnapshot(json?.data?.data ?? json?.data)
        const orgId = json?.data?.organization?.id ?? json?.data?.id
        if (orgId) setOrganizationId(orgId)
        if (json?.data?.venueName) setVenueName(json.data.venueName)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewVenueMode])

  const ensureOrganization = async () => {
    if (organizationId) return organizationId
    const normalizedTimezone = normalizeTimezone(timezone) ?? DEFAULT_TIMEZONE
    const res = await fetch(`/api/onboarding/owner/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: normalizedTimezone, forceNew: isNewVenueMode }),
      credentials: "include",
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const message = typeof json?.error === "string" ? json.error : "Не удалось создать организацию"
      throw new Error(message)
    }
    setOrganizationId(json.organization_id)
    return json.organization_id as string
  }

  const buildStepPayload = (currentStep: number) => {
    if (currentStep === 1) {
      const normalizedTimezone = normalizeTimezone(timezone) ?? DEFAULT_TIMEZONE
      return {
        organizationName: venueName.trim(),
        locationName: venueName.trim(),
        timezone: normalizedTimezone,
        currency,
      }
    }
    if (currentStep === 2) {
      return {
        positions: positions
          .map((name, index) => ({ name: name.trim(), sortOrder: index }))
          .filter((pos) => pos.name),
      }
    }
    if (currentStep === 5) {
      return {
        positions: positions
          .map((name, index) => ({ name: name.trim(), sortOrder: index }))
          .filter((pos) => pos.name),
      }
    }
    return {}
  }

  const saveStep = async (currentStep: number) => {
    const orgId = await ensureOrganization()
    const payload = buildStepPayload(currentStep)
    if (Object.keys(payload).length === 0) return orgId
    const res = await fetch(`/api/onboarding/owner/step/${currentStep}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, payload }),
      credentials: "include",
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const message = typeof json?.error === "string" ? json.error : "Не удалось сохранить шаг"
      throw new Error(message)
    }
    return orgId
  }

  const loadInviteCode = useCallback(async () => {
    setInviteCodeLoading(true)
    setInviteCodeError(null)
    try {
      const res = await fetch("/api/invite-codes", { cache: "no-store", credentials: "include" })
      const json = (await res.json().catch(() => null)) as InviteCodeResponse | null
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "Не удалось получить код")
      }
      const code = json?.data?.code ?? null
      if (!code) {
        throw new Error("Код приглашения не найден")
      }
      setInviteCode(code)
    } catch (error: any) {
      setInviteCodeError(error?.message ?? "Не удалось получить код")
      setInviteCode(null)
    } finally {
      setInviteCodeLoading(false)
    }
  }, [])

  useEffect(() => {
    if (step !== 5 || inviteCode) return
    void loadInviteCode()
  }, [step, inviteCode, loadInviteCode])

  const handleCopyInviteCode = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
      toast({ title: "Код скопирован" })
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" })
    }
  }

  const handleComplete = async () => {
    setIsSaving(true)
    try {
      const orgId = await saveStep(step)
      const res = await fetch(`/api/onboarding/owner/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
        credentials: "include",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const message = typeof json?.error === "string" ? json.error : "Не удалось завершить онбординг"
        throw new Error(message)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось завершить онбординг"
      toast({ title: "Ошибка", description: message, variant: "destructive" })
      return
    } finally {
      setIsSaving(false)
    }

    // Ensure auth-store sees the updated onboarding data (role/status/venueName),
    // but never block the redirect if hydration fails.
    try {
      await hydrateAuth()
    } catch (e) {
      console.error("Failed to hydrate auth store after onboarding completion", e)
    }
    onComplete()
  }

  const [tipsMode, setTipsMode] = useState<"equal" | "hours">("equal")

  const [checklistTab, setChecklistTab] = useState<"opening" | "closing">("opening")
  const [openingChecklist, setOpeningChecklist] = useState<Array<{ id: string; text: string; required: boolean }>>([])
  const [closingChecklist, setClosingChecklist] = useState<Array<{ id: string; text: string; required: boolean }>>([])
  const [draggedChecklistId, setDraggedChecklistId] = useState<string | null>(null)
  const [dragOverChecklistId, setDragOverChecklistId] = useState<string | null>(null)
  const [newChecklistItem, setNewChecklistItem] = useState("")
  const [newItemRequired, setNewItemRequired] = useState(false)

  const [openingFields, setOpeningFields] = useState<ChecklistField[]>([])
  const [closingFields, setClosingFields] = useState<ChecklistField[]>([])
  const [draggedFieldId, setDraggedFieldId] = useState<{ id: string; section: "OPEN" | "CLOSE" } | null>(null)
  const [dragOverFieldId, setDragOverFieldId] = useState<{ id: string; section: "OPEN" | "CLOSE" } | null>(null)
  const [fieldModalOpen, setFieldModalOpen] = useState(false)
  const [fieldModalSection, setFieldModalSection] = useState<"OPEN" | "CLOSE">("OPEN")
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [newField, setNewField] = useState<ChecklistField>({
    id: "",
    section: "OPEN",
    label: "",
    type: "number",
    numericSubtype: "MONEY",
    numericMode: "INPUT",
    required: false,
    placeholder: "",
  })
  const makeBlankMetric = (): MetricDefinition => ({
    id: `metric-${Date.now()}`,
    name: "",
    numericSubtype: "MONEY",
    expression: "",
    referencedFieldIds: [],
    referencedMetricIds: [],
    updatedAt: new Date().toISOString(),
  })

  const makeBlankValidation = (): CloseValidationRule => ({
    id: `validation-${Date.now()}`,
    name: "",
    targetFieldId: "",
    expectedSource: { type: "METRIC", metricId: "" },
    referencedFieldIds: [],
    referencedMetricIds: [],
    tolerance: 0,
    onMismatch: "WARN",
    updatedAt: new Date().toISOString(),
  })

  const [metrics, setMetrics] = useState<MetricDefinition[]>([])
  const [metricModalOpen, setMetricModalOpen] = useState(false)
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null)
  const [metricDraft, setMetricDraft] = useState<MetricDefinition>(makeBlankMetric)
  const [metricModalError, setMetricModalError] = useState<string | null>(null)

  const [validations, setValidations] = useState<CloseValidationRule[]>([])
  const [validationModalOpen, setValidationModalOpen] = useState(false)
  const [editingValidationId, setEditingValidationId] = useState<string | null>(null)
  const [validationDraft, setValidationDraft] = useState<CloseValidationRule>(makeBlankValidation)
  const [validationModalError, setValidationModalError] = useState<string | null>(null)

  const currentStepIndex = Math.max(0, onboardingSteps.indexOf(step))
  const currentStepNumber = currentStepIndex + 1
  const totalSteps = onboardingSteps.length
  const progressPercent = (currentStepNumber / totalSteps) * 100
  const isLastStep = step === lastStep

  const addPosition = () => {
    if (newPosition.trim()) {
      setPositions([...positions, newPosition.trim()])
      setNewPosition("")
    }
  }

  const removePosition = (index: number) => {
    setPositions(positions.filter((_, i) => i !== index))
  }

  const nextStep = async () => {
    const stepIndex = onboardingSteps.indexOf(step)
    if (stepIndex === -1 || stepIndex >= onboardingSteps.length - 1) return

    setIsSaving(true)
    try {
      await saveStep(step)
      setStep(onboardingSteps[stepIndex + 1])
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить шаг"
      toast({ title: "Ошибка", description: message, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const prevStep = () => {
    const stepIndex = onboardingSteps.indexOf(step)
    if (stepIndex <= 0) return
    setStep(onboardingSteps[stepIndex - 1])
  }

  const togglePaymentType = (type: string) => {
    if (selectedPaymentTypes.includes(type)) {
      setSelectedPaymentTypes(selectedPaymentTypes.filter((t) => t !== type))
    } else {
      setSelectedPaymentTypes([...selectedPaymentTypes, type])
    }
  }

  const calculateExample = () => {
    let total = 0
    const parts: string[] = []

    if (selectedPaymentTypes.includes("hourly") && paymentDetails.hourly) {
      const amount = 8 * Number.parseFloat(paymentDetails.hourly)
      total += amount
      parts.push(`8 ч × ${paymentDetails.hourly}`)
    }
    if (selectedPaymentTypes.includes("fixed") && paymentDetails.fixed) {
      total += Number.parseFloat(paymentDetails.fixed)
      parts.push(`${paymentDetails.fixed} за смену`)
    }
    if (selectedPaymentTypes.includes("percent") && paymentDetails.percent) {
      const amount = 10000 * (Number.parseFloat(paymentDetails.percent) / 100)
      total += amount
      parts.push(`${paymentDetails.percent}% от 10 000`)
    }

    return { parts, total }
  }

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return

    const item = {
      id: Date.now().toString(),
      text: newChecklistItem,
      required: newItemRequired,
    }

    if (checklistTab === "opening") {
      setOpeningChecklist([...openingChecklist, item])
    } else {
      setClosingChecklist([...closingChecklist, item])
    }

    setNewChecklistItem("")
    setNewItemRequired(false)
  }

  const removeChecklistItem = (id: string) => {
    if (checklistTab === "opening") {
      setOpeningChecklist(openingChecklist.filter((item) => item.id !== id))
    } else {
      setClosingChecklist(closingChecklist.filter((item) => item.id !== id))
    }
  }

  const reorderChecklist = (fromId: string, toId: string) => {
    const list = checklistTab === "opening" ? openingChecklist : closingChecklist
    const fromIndex = list.findIndex((item) => item.id === fromId)
    const toIndex = list.findIndex((item) => item.id === toId)
    if (fromIndex === -1 || toIndex === -1) return
    const updated = [...list]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    if (checklistTab === "opening") {
      setOpeningChecklist(updated)
    } else {
      setClosingChecklist(updated)
    }
  }

  const restoreTemplate = () => {
    if (checklistTab === "opening") {
      setOpeningChecklist([
        { id: "1", text: "Я на месте", required: true },
        { id: "2", text: "Принял кассу", required: true },
        { id: "3", text: "Проверил размен", required: false },
        { id: "4", text: "Подготовил рабочее место", required: false },
      ])
    } else {
      setClosingChecklist([
        { id: "1", text: "Сверил суммы", required: true },
        { id: "2", text: "Загрузил чеки", required: true },
        { id: "3", text: "Убрал рабочее место", required: false },
        { id: "4", text: "Сдал кассу", required: true },
      ])
    }
  }

  const handleAddField = () => {
    if (!newField.label.trim()) return
    const generatedId = `fld-${Date.now()}`
    const fieldId = editingFieldId ?? (newField.id && newField.id.trim() ? newField.id : generatedId)

    const resolvedMetricId =
      newField.numericMode === "CALCULATED" && fieldModalSection === "CLOSE"
        ? newField.metricId || metrics[0]?.id
        : newField.metricId

    if (fieldModalSection === "CLOSE" && newField.type === "number" && newField.numericMode === "CALCULATED" && !resolvedMetricId) {
      setFieldModalOpen(true)
      return
    }

    const field: ChecklistField = {
      ...newField,
      id: fieldId,
      section: fieldModalSection,
      numericSubtype: newField.type === "number" ? newField.numericSubtype || "MONEY" : undefined,
      numericMode: newField.type === "number" && fieldModalSection === "CLOSE" ? newField.numericMode || "INPUT" : undefined,
      metricId: resolvedMetricId,
    }

    if (field.section === "OPEN") {
      setOpeningFields(
        editingFieldId ? openingFields.map((f) => (f.id === editingFieldId ? field : f)) : [...openingFields, field],
      )
    } else {
      setClosingFields(
        editingFieldId ? closingFields.map((f) => (f.id === editingFieldId ? field : f)) : [...closingFields, field],
      )
    }

    setNewField({
      id: "",
      section: fieldModalSection,
      label: "",
      type: "number",
      numericSubtype: "MONEY",
      numericMode: "INPUT",
      required: false,
      placeholder: "",
      metricId: undefined,
    })
    setEditingFieldId(null)
    setFieldModalOpen(false)
  }

  const removeField = (section: "OPEN" | "CLOSE", id: string) => {
    if (section === "OPEN") {
      setOpeningFields(openingFields.filter((field) => field.id !== id))
    } else {
      setClosingFields(closingFields.filter((field) => field.id !== id))
    }
  }

  const reorderFields = (section: "OPEN" | "CLOSE", fromId: string, toId: string) => {
    const list = section === "OPEN" ? openingFields : closingFields
    const fromIndex = list.findIndex((field) => field.id === fromId)
    const toIndex = list.findIndex((field) => field.id === toId)
    if (fromIndex === -1 || toIndex === -1) return
    const updated = [...list]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    if (section === "OPEN") {
      setOpeningFields(updated)
    } else {
      setClosingFields(updated)
    }
  }

  // Step 1: Venue Data
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 overflow-auto pb-32">
          <div className="max-w-md mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Store className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Шаг {currentStepNumber} из {totalSteps}
                  </p>
                  <h1 className="text-2xl font-bold">Данные заведения</h1>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            {/* Venue Info */}
            <Card className="p-5 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="venue-name">Название заведения*</Label>
                <Input
                  id="venue-name"
                  placeholder="Например: Café Central"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label>Часовой пояс*</Label>
                <TimezoneSelect
                  value={timezone}
                  onChange={setTimezone}
                  options={timezoneOptions}
                  placeholder="Например: Europe/Prague"
                />
                <p className="text-xs text-muted-foreground">Определено автоматически, можно изменить</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Валюта*</Label>
                <div className="grid grid-cols-3 gap-2">
                  {["CZK", "EUR", "USD"].map((curr) => (
                    <Button
                      key={curr}
                      variant={currency === curr ? "default" : "outline"}
                      onClick={() => setCurrency(curr)}
                      className="h-12"
                    >
                      {curr}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
              <p>Эти настройки можно изменить позже в разделе "Настройки"</p>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button
            className="w-full h-12 text-base"
            size="lg"
            onClick={nextStep}
            disabled={isSaving || !venueName.trim()}
          >
            Далее
          </Button>
        </div>
      </div>
    )
  }

  // Step 2: Positions (unchanged)
  if (step === 2) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 overflow-auto pb-32">
          <div className="max-w-md mx-auto p-6 space-y-6">
            <div className="space-y-2">
              <Button variant="ghost" size="icon" onClick={prevStep} className="rounded-full -ml-2">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Шаг {currentStepNumber} из {totalSteps}
                  </p>
                  <h1 className="text-2xl font-bold">Должности</h1>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <Card className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">Добавьте должности в вашем заведении</p>

              <div className="flex flex-wrap gap-2">
                {positions.map((pos, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="pl-3 pr-2 py-2 text-sm flex items-center gap-2 cursor-pointer hover:bg-secondary/80"
                  >
                    {pos}
                    <button
                      onClick={() => setPositions(positions.filter((_, i) => i !== index))}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Новая должность"
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    newPosition.trim() &&
                    (setPositions([...positions, newPosition.trim()]), setNewPosition(""))
                  }
                  className="h-11"
                />
                <Button
                  onClick={() => {
                    if (newPosition.trim()) {
                      setPositions([...positions, newPosition.trim()])
                      setNewPosition("")
                    }
                  }}
                  size="icon"
                  className="h-11 w-11 flex-shrink-0"
                >
                  <Plus className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </div>
            </Card>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
              <p>Должности можно добавить или изменить позже</p>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button className="w-full h-12 text-base" size="lg" onClick={nextStep} disabled={isSaving}>
            Далее
          </Button>
          <Button variant="ghost" className="w-full" onClick={nextStep} disabled={isSaving}>
            Пропустить
          </Button>
        </div>
      </div>
    )
  }

  if (step === 3) {
    const example = selectedPaymentTypes.length > 0 ? calculateExample() : null

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 overflow-auto pb-32">
          <div className="max-w-md mx-auto p-6 space-y-6">
            <div className="space-y-2">
              <Button variant="ghost" size="icon" onClick={prevStep} className="rounded-full -ml-2">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Шаг {currentStepNumber} из {totalSteps}
                  </p>
                  <h1 className="text-2xl font-bold">Оплата сотрудникам</h1>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            {selectedPaymentTypes.length === 0 && (
              <Card className="p-4 bg-secondary/30 border-border">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <div>
                    <p className="text-sm font-medium">Выберите схемы оплаты</p>
                    <p className="text-sm text-muted-foreground">
                      Можно выбрать несколько вариантов для разных сотрудников
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <div className="space-y-3">
              {/* Hourly */}
              <Card
                className={`p-4 cursor-pointer border-2 transition-all ${
                  selectedPaymentTypes.includes("hourly") ? "border-primary bg-primary/5" : "border-border"
                }`}
                onClick={() => togglePaymentType("hourly")}
              >
                <div className="flex items-start gap-3">
                  <Checkbox checked={selectedPaymentTypes.includes("hourly")} className="mt-1" />
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">Почасовая ставка</h3>
                    <p className="text-sm text-muted-foreground mt-1">Оплата за каждый отработанный час</p>
                    {selectedPaymentTypes.includes("hourly") && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <Label htmlFor="hourly-rate" className="text-xs">
                          Ставка (CZK/час)
                        </Label>
                        <Input
                          id="hourly-rate"
                          type="number"
                          placeholder="180"
                          value={paymentDetails.hourly}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, hourly: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          className="h-10 mt-2"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Fixed */}
              <Card
                className={`p-4 cursor-pointer border-2 transition-all ${
                  selectedPaymentTypes.includes("fixed") ? "border-primary bg-primary/5" : "border-border"
                }`}
                onClick={() => togglePaymentType("fixed")}
              >
                <div className="flex items-start gap-3">
                  <Checkbox checked={selectedPaymentTypes.includes("fixed")} className="mt-1" />
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Banknote className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">Фикс за смену</h3>
                    <p className="text-sm text-muted-foreground mt-1">Фиксированная сумма за смену</p>
                    {selectedPaymentTypes.includes("fixed") && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <Label htmlFor="fixed-rate" className="text-xs">
                          Фикс (CZK/смена)
                        </Label>
                        <Input
                          id="fixed-rate"
                          type="number"
                          placeholder="200"
                          value={paymentDetails.fixed}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, fixed: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          className="h-10 mt-2"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Percent */}
              <Card
                className={`p-4 cursor-pointer border-2 transition-all ${
                  selectedPaymentTypes.includes("percent") ? "border-primary bg-primary/5" : "border-border"
                }`}
                onClick={() => togglePaymentType("percent")}
              >
                <div className="flex items-start gap-3">
                  <Checkbox checked={selectedPaymentTypes.includes("percent")} className="mt-1" />
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Percent className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">% от выручки</h3>
                    <p className="text-sm text-muted-foreground mt-1">Процент от выручки смены</p>
                    {selectedPaymentTypes.includes("percent") && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <Label htmlFor="percent-rate" className="text-xs">
                          Процент (%)
                        </Label>
                        <Input
                          id="percent-rate"
                          type="number"
                          placeholder="3"
                          value={paymentDetails.percent}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, percent: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          className="h-10 mt-2"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {example && example.parts.length > 0 && (
              <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Пример расчёта:</p>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm text-muted-foreground">{example.parts.join(" + ")}</p>
                    <p className="text-lg font-bold text-primary">{example.total.toFixed(0)} ₽</p>
                  </div>
                </div>
              </Card>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
              <p>Можно настроить детальнее позже для каждого сотрудника</p>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button className="w-full h-12 text-base" size="lg" onClick={nextStep} disabled={isSaving}>
            Далее
          </Button>
        </div>
      </div>
    )
  }

  // Step 4: Tips Settings
  if (step === 4) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 overflow-auto pb-32">
          <div className="max-w-md mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <Button variant="ghost" size="icon" onClick={prevStep} className="rounded-full -ml-2">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Шаг {currentStepNumber} из {totalSteps}
                  </p>
                  <h1 className="text-2xl font-bold">Распределение чаевых</h1>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            {/* Tips Modes */}
            <div className="space-y-3">
              <Card
                className={`p-4 cursor-pointer border-2 transition-all ${
                  tipsMode === "equal" ? "border-primary bg-primary/5" : "border-border"
                }`}
                onClick={() => setTipsMode("equal")}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Поровну между всеми</h3>
                    <p className="text-sm text-muted-foreground mt-1">Делим чаевые поровну на всех сотрудников</p>
                    {tipsMode === "equal" && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">Пример на 3 человек:</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Всего чаевых</span>
                            <span className="font-medium">6 000 ₽</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Каждому</span>
                            <span className="font-medium text-primary">2 000 ₽</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <Card
                className={`p-4 cursor-pointer border-2 transition-all ${
                  tipsMode === "hours" ? "border-primary bg-primary/5" : "border-border"
                }`}
                onClick={() => setTipsMode("hours")}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">По отработанным часам</h3>
                    <p className="text-sm text-muted-foreground mt-1">Пропорционально времени на смене</p>
                    {tipsMode === "hours" && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">Пример на 2 человек:</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">8 часов (Иван)</span>
                            <span className="font-medium">4 000 ₽</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">4 часа (Мария)</span>
                            <span className="font-medium">2 000 ₽</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
              <p>Это правило по умолчанию, можно настроить по должностям позже</p>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button className="w-full h-12 text-base" size="lg" onClick={nextStep} disabled={isSaving}>
            Далее
          </Button>
        </div>
      </div>
    )
  }

  // Step 5: Invite Employees
  if (step === 5) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 overflow-auto pb-32">
          <div className="max-w-md mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <Button variant="ghost" size="icon" onClick={prevStep} className="rounded-full -ml-2">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Шаг {currentStepNumber} из {totalSteps}
                  </p>
                  <h1 className="text-2xl font-bold">Пригласить сотрудников</h1>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <div className="space-y-3">
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-semibold">Ваш код для приглашения сотрудников</h3>
                    <p className="text-sm text-muted-foreground">Отправьте его сотруднику, чтобы он присоединился к заведению</p>
                  </div>
                </div>

                <div className="bg-secondary/50 rounded-lg p-4 text-center space-y-2">
                  {inviteCodeLoading && <p className="text-sm text-muted-foreground">Загрузка кода...</p>}
                  {!inviteCodeLoading && inviteCodeError && <p className="text-sm text-destructive">{inviteCodeError}</p>}
                  {!inviteCodeLoading && !inviteCodeError && inviteCode && (
                    <p className="text-2xl font-bold tracking-wider">{inviteCode}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1 h-11"
                    onClick={handleCopyInviteCode}
                    disabled={!inviteCode || inviteCodeLoading}
                  >
                    <Copy className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Скопировать код
                  </Button>
                  {inviteCodeError && (
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={() => void loadInviteCode()}
                      disabled={inviteCodeLoading}
                    >
                      Повторить
                    </Button>
                  )}
                </div>
              </Card>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
              <p>Пригласить сотрудников можно будет позже</p>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button
            className="w-full h-12 text-base"
            size="lg"
            onClick={isLastStep ? handleComplete : nextStep}
            disabled={isSaving}
          >
            {isLastStep ? "Завершить настройку" : "Далее"}
          </Button>
          {!isLastStep && (
            <Button variant="ghost" className="w-full" onClick={nextStep} disabled={isSaving}>
              Пропустить
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (step === 6) {
    const currentChecklist = checklistTab === "opening" ? openingChecklist : closingChecklist

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 overflow-auto pb-32">
          <div className="max-w-md mx-auto p-6 space-y-6">
            <div className="space-y-2">
              <Button variant="ghost" size="icon" onClick={prevStep} className="rounded-full -ml-2">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ListChecks className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Шаг {currentStepNumber} из {totalSteps}
                  </p>
                  <h1 className="text-2xl font-bold">Чек-листы смены</h1>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-secondary/30 rounded-xl">
              <Button
                variant={checklistTab === "opening" ? "default" : "ghost"}
                className="flex-1 h-10"
                onClick={() => setChecklistTab("opening")}
              >
                Открытие
              </Button>
              <Button
                variant={checklistTab === "closing" ? "default" : "ghost"}
                className="flex-1 h-10"
                onClick={() => setChecklistTab("closing")}
              >
                Закрытие
              </Button>
            </div>

            <Card className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Настройте пункты, которые сотрудник должен проверить при{" "}
                {checklistTab === "opening" ? "открытии" : "закрытии"} смены
              </p>

              {currentChecklist.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">Чек-лист пуст</p>
                  <Button variant="outline" size="sm" onClick={restoreTemplate}>
                    Вернуть шаблон
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 -mt-[10px]">
                  {currentChecklist.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 p-3 bg-secondary/20 rounded-lg hover:bg-secondary/30 transition-colors transition-transform duration-200 ease-out cursor-grab active:cursor-grabbing",
                        draggedChecklistId === item.id && "scale-[1.02] shadow-md",
                        dragOverChecklistId === item.id && "ring-1 ring-primary/30",
                      )}
                      draggable
                      onDragStart={() => setDraggedChecklistId(item.id)}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (draggedChecklistId && draggedChecklistId !== item.id) {
                          setDragOverChecklistId(item.id)
                        }
                      }}
                      onDrop={() => {
                        if (draggedChecklistId && draggedChecklistId !== item.id) {
                          reorderChecklist(draggedChecklistId, item.id)
                        }
                        setDraggedChecklistId(null)
                        setDragOverChecklistId(null)
                      }}
                      onDragLeave={() => setDragOverChecklistId(null)}
                      onDragEnd={() => {
                        setDraggedChecklistId(null)
                        setDragOverChecklistId(null)
                      }}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{item.text}</p>
                        {item.required && (
                          <Badge variant="secondary" className="text-xs mt-1">
                            Обязательный
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => removeChecklistItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.5} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Item */}
              <div className="pt-4 border-t border-border space-y-3">
                <Input
                  placeholder="Новый пункт"
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addChecklistItem()}
                  className="h-11"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={newItemRequired} onCheckedChange={setNewItemRequired} id="required-toggle" />
                    <Label htmlFor="required-toggle" className="text-sm cursor-pointer">
                      Обязательный
                    </Label>
                  </div>
                  <Button onClick={addChecklistItem} disabled={!newChecklistItem.trim()}>
                    <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Добавить
                  </Button>
                </div>
              </div>
            </Card>

            {/* Preview */}
            <Card className="p-4 bg-secondary/20 border-dashed">
              <p className="text-xs font-medium text-muted-foreground mb-3">Так будет выглядеть у сотрудника:</p>
              <div className="bg-background rounded-lg p-4 space-y-2">
                {currentChecklist.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-start gap-2">
                      <Checkbox className="mt-0.5 size-5 rounded-full border-2" />
                    <div>
                      <p className="text-sm">{item.text}</p>
                      {item.required && <p className="text-xs text-muted-foreground">*обязательно</p>}
                    </div>
                  </div>
                ))}
                {currentChecklist.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{currentChecklist.length - 3} пунктов
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button className="w-full h-12 text-base" size="lg" onClick={nextStep} disabled={isSaving}>
            Далее
          </Button>
        </div>
      </div>
    )
  }

  if (step === 7) {
    const getFieldIcon = (type: string) => {
      switch (type) {
        case "number":
          return <DollarSign className="h-4 w-4" strokeWidth={1.5} />
        case "text":
          return <Type className="h-4 w-4" strokeWidth={1.5} />
        case "photo":
          return <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
        case "boolean":
          return <ToggleLeft className="h-4 w-4" strokeWidth={1.5} />
        default:
          return <FileText className="h-4 w-4" strokeWidth={1.5} />
      }
    }

    const openingNumeric = openingFields.filter((f) => f.type === "number")
    const closingNumeric = closingFields.filter((f) => f.type === "number")
    const validateFields = closingNumeric.filter((f) => f.numericMode === "VALIDATE")

    const numericFieldMeta: FieldMetaIndex = Object.fromEntries(
      [...openingNumeric, ...closingNumeric].map((f) => [f.id, { numericSubtype: (f.numericSubtype as NumericSubtype) || "MONEY" }]),
    )

    const metricMeta: FieldMetaIndex = Object.fromEntries(metrics.map((m) => [m.id, { numericSubtype: m.numericSubtype }]))

    const availableFieldsLite = [...openingNumeric, ...closingNumeric].map((f) => ({
      id: f.id,
      label: f.label,
      numericSubtype: (f.numericSubtype as NumericSubtype) || "MONEY",
      section: f.section,
    }))

    const availableMetricsLite = metrics.map((m) => ({
      id: m.id,
      label: m.name || m.id,
      numericSubtype: m.numericSubtype,
    }))

    const toDisplayExpression = (canonical: string, fieldsLite = availableFieldsLite, metricsLite = availableMetricsLite) => {
      const fieldMap = Object.fromEntries(fieldsLite.map((f) => [f.id, f.label]))
      const metricMap = Object.fromEntries(metricsLite.map((m) => [m.id, m.label]))
      return canonical
        .replace(/\{\{field:([^}]+)\}\}/g, (_, id) => fieldMap[id] || id)
        .replace(/\{\{metric:([^}]+)\}\}/g, (_, id) => metricMap[id] || id)
    }

    const openMetricModal = (metric?: MetricDefinition) => {
      if (metric) {
        setEditingMetricId(metric.id)
        setMetricDraft(metric)
      } else {
        setEditingMetricId(null)
        setMetricDraft(makeBlankMetric())
      }
      setMetricModalError(null)
      setMetricModalOpen(true)
    }

    const saveMetric = () => {
      if (!metricDraft.name.trim() || !metricDraft.expression.trim()) {
        setMetricModalError("Укажите название и формулу")
        return
      }
      const refsFields = extractReferencedFields(metricDraft.expression)
      const refsMetrics = extractReferencedMetrics(metricDraft.expression)
      if (refsMetrics.includes(metricDraft.id)) {
        setMetricModalError("Метрика не может ссылаться сама на себя")
        return
      }

      const sampleValues: Record<string, number> = {}
      refsFields.forEach((id) => {
        sampleValues[id] = 0
      })
      refsMetrics.forEach((id) => {
        sampleValues[id] = 0
      })

      const metricMetaForEval: FieldMetaIndex = {
        ...metricMeta,
        ...Object.fromEntries(metrics.map((m) => [m.id, { numericSubtype: m.numericSubtype }])),
      }

      const updated: MetricDefinition = {
        ...metricDraft,
        referencedFieldIds: refsFields,
        referencedMetricIds: refsMetrics,
        updatedAt: new Date().toISOString(),
      }

      const res = evaluateFormula(updated.expression, sampleValues, { fieldMeta: numericFieldMeta, metricMeta: metricMetaForEval })
      if (!res.ok && res.error) {
        setMetricModalError(res.error)
        return
      }

      if (editingMetricId) {
        setMetrics(metrics.map((m) => (m.id === editingMetricId ? updated : m)))
      } else {
        setMetrics([...metrics, updated])
      }
      setMetricModalOpen(false)
      setEditingMetricId(null)
    }

    const deleteMetric = (id: string) => {
      setMetrics(metrics.filter((m) => m.id !== id))
      setClosingFields(closingFields.map((f) => (f.metricId === id ? { ...f, metricId: undefined, numericMode: "INPUT" } : f)))
      setValidations(validations.filter((v) => !(v.expectedSource.type === "METRIC" && v.expectedSource.metricId === id)))
    }

    const openValidationModal = (rule?: CloseValidationRule) => {
      if (rule) {
        setEditingValidationId(rule.id)
        setValidationDraft(rule)
      } else {
        const blank = makeBlankValidation()
        blank.targetFieldId = validateFields[0]?.id || ""
        if (metrics[0]) blank.expectedSource = { type: "METRIC", metricId: metrics[0].id }
        setEditingValidationId(null)
        setValidationDraft(blank)
      }
      setValidationModalError(null)
      setValidationModalOpen(true)
    }

    const saveValidation = () => {
      if (!validationDraft.targetFieldId) {
        setValidationModalError("Выберите поле для проверки")
        return
      }

      let referencedFieldIds: string[] = []
      let referencedMetricIds: string[] = []
      let normalizedSource = validationDraft.expectedSource

      if (validationDraft.expectedSource.type === "METRIC") {
        if (!validationDraft.expectedSource.metricId) {
          setValidationModalError("Выберите метрику")
          return
        }
        referencedMetricIds = [validationDraft.expectedSource.metricId]
      } else {
        referencedFieldIds = extractReferencedFields(validationDraft.expectedSource.expression)
        referencedMetricIds = extractReferencedMetrics(validationDraft.expectedSource.expression)
        const evalResult = evaluateFormula(validationDraft.expectedSource.expression, {}, { fieldMeta: numericFieldMeta, metricMeta })
        if (!evalResult.ok && evalResult.error) {
          setValidationModalError(evalResult.error)
          return
        }
        normalizedSource = { type: "EXPRESSION", expression: validationDraft.expectedSource.expression.trim() }
      }

      const updated: CloseValidationRule = {
        ...validationDraft,
        expectedSource: normalizedSource,
        referencedFieldIds,
        referencedMetricIds,
        tolerance: validationDraft.tolerance ?? 0,
        updatedAt: new Date().toISOString(),
      }

      if (editingValidationId) {
        setValidations(validations.map((v) => (v.id === editingValidationId ? updated : v)))
      } else {
        setValidations([...validations, updated])
      }

      setValidationModalOpen(false)
      setEditingValidationId(null)
    }

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 overflow-auto pb-32">
          <div className="max-w-md mx-auto p-6 space-y-6">
            <div className="space-y-2">
              <Button variant="ghost" size="icon" onClick={prevStep} className="rounded-full -ml-2">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Шаг {currentStepNumber} из {totalSteps}
                  </p>
                  <h1 className="text-2xl font-bold">Касса: поля, метрики и проверки</h1>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            {/* Block A */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Открытие кассы</h3>
                  <p className="text-sm text-muted-foreground">Определите, что должен заполнить сотрудник при открытии</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingFieldId(null)
                    setFieldModalSection("OPEN")
                    setNewField({
                      id: `fld-${Date.now()}`,
                      section: "OPEN",
                      label: "",
                      type: "number",
                      numericSubtype: "MONEY",
                      numericMode: "INPUT",
                      required: false,
                      placeholder: "",
                    })
                    setFieldModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Поле
                </Button>
              </div>
              <div className="space-y-2">
                {openingFields.map((field) => (
                  <div
                    key={field.id}
                    className={cn(
                      "flex items-center gap-3 p-3 bg-secondary/20 rounded-lg hover:bg-secondary/30 transition-colors cursor-grab active:cursor-grabbing",
                      draggedFieldId?.id === field.id && draggedFieldId.section === "OPEN" && "scale-[1.02] shadow-md",
                      dragOverFieldId?.id === field.id && dragOverFieldId.section === "OPEN" && "ring-1 ring-primary/30",
                    )}
                    draggable
                    onDragStart={() => setDraggedFieldId({ id: field.id, section: "OPEN" })}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (draggedFieldId?.id && draggedFieldId.section === "OPEN" && draggedFieldId.id !== field.id) {
                        setDragOverFieldId({ id: field.id, section: "OPEN" })
                      }
                    }}
                    onDrop={() => {
                      if (draggedFieldId?.id && draggedFieldId.section === "OPEN" && draggedFieldId.id !== field.id) {
                        reorderFields("OPEN", draggedFieldId.id, field.id)
                      }
                      setDraggedFieldId(null)
                      setDragOverFieldId(null)
                    }}
                    onDragLeave={() => setDragOverFieldId(null)}
                    onDragEnd={() => {
                      setDraggedFieldId(null)
                      setDragOverFieldId(null)
                    }}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {getFieldIcon(field.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{field.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {field.type === "number" ? "Число" : field.type === "text" ? "Текст" : field.type === "boolean" ? "Да/Нет" : "Фото"}
                        </Badge>
                        {field.type === "number" && field.numericSubtype && (
                          <Badge variant="secondary" className="text-xs">
                            {field.numericSubtype === "MONEY" ? "Money" : field.numericSubtype === "INTEGER" ? "Int" : "%"}
                          </Badge>
                        )}
                        {field.required && (
                          <Badge variant="secondary" className="text-xs">
                            *
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => {
                          setEditingFieldId(field.id)
                          setFieldModalSection("OPEN")
                          setNewField({
                            ...field,
                            numericSubtype: field.type === "number" ? field.numericSubtype || "MONEY" : undefined,
                            numericMode: field.type === "number" ? field.numericMode || "INPUT" : undefined,
                          })
                          setFieldModalOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeField("OPEN", field.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Block B */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Закрытие кассы</h3>
                  <p className="text-sm text-muted-foreground">
                    Поля закрытия поддерживают режимы: ввод, расчёт или проверка
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingFieldId(null)
                    setFieldModalSection("CLOSE")
                    setNewField({
                      id: `fld-${Date.now()}`,
                      section: "CLOSE",
                      label: "",
                      type: "number",
                      numericSubtype: "MONEY",
                      numericMode: "INPUT",
                      required: false,
                      placeholder: "",
                    })
                    setFieldModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Поле
                </Button>
              </div>
              <div className="space-y-2">
                {closingFields.map((field) => {
                  const metricName = field.metricId ? metrics.find((m) => m.id === field.metricId)?.name || field.metricId : null
                  return (
                  <div
                    key={field.id}
                    className={cn(
                      "flex items-center gap-3 p-3 bg-secondary/20 rounded-lg hover:bg-secondary/30 transition-colors cursor-grab active:cursor-grabbing",
                      draggedFieldId?.id === field.id && draggedFieldId.section === "CLOSE" && "scale-[1.02] shadow-md",
                      dragOverFieldId?.id === field.id && dragOverFieldId.section === "CLOSE" && "ring-1 ring-primary/30",
                    )}
                    draggable
                    onDragStart={() => setDraggedFieldId({ id: field.id, section: "CLOSE" })}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (draggedFieldId?.id && draggedFieldId.section === "CLOSE" && draggedFieldId.id !== field.id) {
                        setDragOverFieldId({ id: field.id, section: "CLOSE" })
                      }
                    }}
                    onDrop={() => {
                      if (draggedFieldId?.id && draggedFieldId.section === "CLOSE" && draggedFieldId.id !== field.id) {
                        reorderFields("CLOSE", draggedFieldId.id, field.id)
                      }
                      setDraggedFieldId(null)
                      setDragOverFieldId(null)
                    }}
                    onDragLeave={() => setDragOverFieldId(null)}
                    onDragEnd={() => {
                      setDraggedFieldId(null)
                      setDragOverFieldId(null)
                    }}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {getFieldIcon(field.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{field.label}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {field.type === "number" ? "Число" : field.type === "text" ? "Текст" : field.type === "boolean" ? "Да/Нет" : "Фото"}
                        </Badge>
                        {field.type === "number" && field.numericSubtype && (
                          <Badge variant="secondary" className="text-xs">
                            {field.numericSubtype === "MONEY" ? "Money" : field.numericSubtype === "INTEGER" ? "Int" : "%"}
                          </Badge>
                        )}
                        {field.type === "number" && field.numericMode && (
                          <Badge variant="outline" className="text-xs">
                            {field.numericMode === "INPUT"
                              ? "Ввод"
                              : field.numericMode === "CALCULATED"
                                ? "Расчёт"
                                : "Проверка"}
                          </Badge>
                        )}
                        {field.numericMode === "CALCULATED" && metricName && (
                          <Badge variant="secondary" className="text-[10px]">
                            Метрика: {metricName}
                          </Badge>
                        )}
                        {field.required && (
                          <Badge variant="secondary" className="text-xs">
                            *
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => {
                          setEditingFieldId(field.id)
                          setFieldModalSection("CLOSE")
                          setNewField({
                            ...field,
                            numericSubtype: field.type === "number" ? field.numericSubtype || "MONEY" : undefined,
                            numericMode: field.type === "number" ? field.numericMode || "INPUT" : undefined,
                          })
                          setFieldModalOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeField("CLOSE", field.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                  )
                })}
              </div>
            </Card>

            {/* Metrics */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Метрики (формулы)</h3>
                  <p className="text-sm text-muted-foreground">Быстрые расчёты для чаевых, комиссий и разниц</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openMetricModal()}>
                  <Plus className="h-4 w-4 mr-1" /> Метрика
                </Button>
              </div>

              {metrics.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed text-sm text-muted-foreground">
                  Добавьте метрику, чтобы ссылаться на неё в полях закрытия или проверках.
                </div>
              ) : (
                <div className="space-y-3">
                  {metrics.map((metric) => (
                    <div key={metric.id} className="p-3 rounded-lg border bg-secondary/10 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{metric.name || "Без названия"}</p>
                            <Badge variant="outline" className="text-[11px]">
                              {metric.numericSubtype === "MONEY" ? "Money" : metric.numericSubtype === "PERCENT" ? "%" : "Int"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {toDisplayExpression(metric.expression, availableFieldsLite, availableMetricsLite) || "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openMetricModal(metric)}>
                            Изменить
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteMetric(metric.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Validations */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Проверки закрытия</h3>
                  <p className="text-sm text-muted-foreground">Сравнивайте поля с метриками, задавайте допуск и реакцию</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openValidationModal()} disabled={validateFields.length === 0}>
                  <Plus className="h-4 w-4 mr-1" /> Проверка
                </Button>
              </div>

              {validateFields.length === 0 && (
                <div className="p-4 rounded-lg border border-dashed text-sm text-muted-foreground">
                  Добавьте в закрытие поле с режимом «Проверка», чтобы подключить валидации.
                </div>
              )}

              {validations.length === 0 && validateFields.length > 0 && (
                <div className="p-4 rounded-lg border border-dashed text-sm text-muted-foreground">
                  Пока нет проверок. Выберите поле (режим «Проверка») и задайте ожидаемое значение.
                </div>
              )}

              {validations.length > 0 && (
                <div className="space-y-3">
                  {validations.map((rule) => {
                    const target = closingFields.find((f) => f.id === rule.targetFieldId)
                    const expected =
                      rule.expectedSource.type === "METRIC"
                        ? (() => {
                            const metricId = rule.expectedSource.metricId
                            return metrics.find((metric) => metric.id === metricId)?.name ?? metricId
                          })()
                        : rule.expectedSource.expression
                    return (
                      <div key={rule.id} className="p-3 border rounded-lg bg-secondary/10 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <p className="font-semibold truncate">{rule.name || "Без названия"}</p>
                            <p className="text-xs text-muted-foreground">
                              Поле: {target?.label || rule.targetFieldId} • Ожидаемое: {expected}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Допуск: {rule.tolerance ?? 0} • При несоответствии: {rule.onMismatch === "WARN" ? "Предупредить" : "Блокировать"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => openValidationModal(rule)}>
                              Изменить
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setValidations(validations.filter((v) => v.id !== rule.id))}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Add Field Modal */}
        {fieldModalOpen && (
          <BottomSheet
            isOpen={fieldModalOpen}
            onClose={() => {
              setFieldModalOpen(false)
              setEditingFieldId(null)
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  Добавить поле в {fieldModalSection === "OPEN" ? "открытие" : "закрытие"}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setFieldModalOpen(false)
                    setEditingFieldId(null)
                  }}
                  className="rounded-full"
                >
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="field-label">Название поля*</Label>
                  <Input
                    id="field-label"
                    placeholder="Например: Остаток наличных"
                    value={newField.label}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Тип поля*</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "number", label: "Число", icon: DollarSign },
                      { value: "text", label: "Текст", icon: Type },
                      { value: "photo", label: "Фото", icon: Camera },
                      { value: "boolean", label: "Да/Нет", icon: ToggleLeft },
                    ].map((type) => (
                      <Button
                        key={type.value}
                        variant={newField.type === type.value ? "default" : "outline"}
                        className="h-11 justify-start"
                        onClick={() =>
                          setNewField({
                            ...newField,
                            type: type.value as ChecklistField["type"],
                            numericSubtype: type.value === "number" ? newField.numericSubtype || "MONEY" : undefined,
                            numericMode: type.value === "number" ? newField.numericMode || "INPUT" : undefined,
                          })
                        }
                      >
                        <type.icon className="h-4 w-4 mr-2" strokeWidth={1.5} />
                        {type.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {newField.type === "number" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Подтип числа</Label>
                      <div className="flex flex-wrap gap-2">
                        {(["MONEY", "INTEGER", "PERCENT"] as NumericSubtype[]).map((sub) => (
                          <Button
                            key={sub}
                            variant={newField.numericSubtype === sub ? "default" : "outline"}
                            className="h-10 flex-1"
                            onClick={() => setNewField({ ...newField, numericSubtype: sub })}
                          >
                            {sub === "MONEY" ? "Деньги" : sub === "INTEGER" ? "Целое" : "%"}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {fieldModalSection === "CLOSE" && (
                      <div className="space-y-2">
                        <Label>Режим поля</Label>
                        <div className="flex flex-wrap gap-2">
                          {(["INPUT", "CALCULATED", "VALIDATE"] as NumericMode[]).map((mode) => (
                            <Button
                              key={mode}
                              variant={newField.numericMode === mode ? "default" : "outline"}
                              className="h-10 flex-1"
                              onClick={() =>
                                setNewField({
                                  ...newField,
                                  numericMode: mode,
                                  metricId: mode === "CALCULATED" ? newField.metricId || metrics[0]?.id : undefined,
                                })
                              }
                            >
                              {mode === "INPUT" ? "Ввод" : mode === "CALCULATED" ? "Расчёт" : "Проверка"}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {fieldModalSection === "CLOSE" && newField.type === "number" && newField.numericMode === "CALCULATED" && (
                  <div className="space-y-2">
                    <Label>Источник метрики</Label>
                    {metrics.length === 0 ? (
                      <p className="text-xs text-destructive">Добавьте метрику в разделе «Формулы», чтобы привязать расчёт.</p>
                    ) : (
                      <select
                        className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
                        value={newField.metricId || ""}
                        onChange={(e) => setNewField({ ...newField, metricId: e.target.value })}
                      >
                        <option value="" disabled>
                          Выберите метрику
                        </option>
                        {metrics.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {(newField.type === "number" || newField.type === "text") && (
                  <div className="space-y-2">
                    <Label htmlFor="field-placeholder">Подсказка</Label>
                    <Input
                      id="field-placeholder"
                      placeholder="Текст-подсказка для пользователя"
                      value={newField.placeholder}
                      onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })}
                      className="h-11"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-lg">
                  <Label htmlFor="field-required" className="cursor-pointer">
                    Обязательное поле
                  </Label>
                  <Switch
                    id="field-required"
                    checked={newField.required}
                    onCheckedChange={(checked) => setNewField({ ...newField, required: checked })}
                  />
                </div>
              </div>

              <Button className="w-full h-12" onClick={handleAddField} disabled={!newField.label.trim()}>
                {editingFieldId ? "Сохранить" : "Добавить поле"}
              </Button>
            </div>
          </BottomSheet>
        )}

        {metricModalOpen && (
          <BottomSheet isOpen={metricModalOpen} onClose={() => setMetricModalOpen(false)}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{editingMetricId ? "Изменить метрику" : "Новая метрика"}</h2>
                <Button variant="ghost" size="icon" onClick={() => setMetricModalOpen(false)} className="rounded-full">
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="metric-name">Название*</Label>
                  <Input
                    id="metric-name"
                    value={metricDraft.name}
                    onChange={(e) => setMetricDraft({ ...metricDraft, name: e.target.value })}
                    placeholder="Например: Чаевые наличкой"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Тип числа</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["MONEY", "INTEGER"] as NumericSubtype[]).map((sub) => (
                      <Button
                        key={sub}
                        variant={metricDraft.numericSubtype === sub ? "default" : "outline"}
                        className="h-10"
                        onClick={() => setMetricDraft({ ...metricDraft, numericSubtype: sub })}
                      >
                        {sub === "MONEY" ? "Деньги" : "Целое"}
                      </Button>
                    ))}
                  </div>
                </div>

                <FormulaBuilder
                  title="Формула метрики"
                  availableFields={availableFieldsLite}
                  availableMetrics={availableMetricsLite.filter((m) => m.id !== metricDraft.id)}
                  fieldMeta={numericFieldMeta}
                  expression={metricDraft.expression}
                  onChange={(expr) => setMetricDraft({ ...metricDraft, expression: expr })}
                  onEval={() => setMetricModalError(null)}
                />

                {metricModalError && <p className="text-xs text-destructive">{metricModalError}</p>}
              </div>

              <Button className="w-full h-12" onClick={saveMetric} disabled={!metricDraft.name.trim() || !metricDraft.expression.trim()}>
                {editingMetricId ? "Сохранить" : "Добавить метрику"}
              </Button>
            </div>
          </BottomSheet>
        )}

        {validationModalOpen && (
          <BottomSheet isOpen={validationModalOpen} onClose={() => setValidationModalOpen(false)}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{editingValidationId ? "Изменить проверку" : "Новая проверка"}</h2>
                <Button variant="ghost" size="icon" onClick={() => setValidationModalOpen(false)} className="rounded-full">
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="validation-name">Название</Label>
                  <Input
                    id="validation-name"
                    value={validationDraft.name}
                    onChange={(e) => setValidationDraft({ ...validationDraft, name: e.target.value })}
                    placeholder="Например: Сверка наличных"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Целевое поле (режим «Проверка»)</Label>
                  <select
                    className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
                    value={validationDraft.targetFieldId}
                    onChange={(e) => setValidationDraft({ ...validationDraft, targetFieldId: e.target.value })}
                  >
                    <option value="">Выберите поле</option>
                    {validateFields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Ожидаемое значение</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={validationDraft.expectedSource.type === "METRIC" ? "default" : "outline"}
                      onClick={() =>
                        setValidationDraft({
                          ...validationDraft,
                          expectedSource: { type: "METRIC", metricId: metrics[0]?.id || "" },
                        })
                      }
                    >
                      Метрика
                    </Button>
                    <Button
                      size="sm"
                      variant={validationDraft.expectedSource.type === "EXPRESSION" ? "default" : "outline"}
                      onClick={() =>
                        setValidationDraft({
                          ...validationDraft,
                          expectedSource: {
                            type: "EXPRESSION",
                            expression:
                              validationDraft.expectedSource.type === "EXPRESSION"
                                ? validationDraft.expectedSource.expression
                                : "",
                          },
                        })
                      }
                    >
                      Формула
                    </Button>
                  </div>

                  {validationDraft.expectedSource.type === "METRIC" ? (
                    <select
                      className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
                      value={validationDraft.expectedSource.metricId}
                      onChange={(e) =>
                        setValidationDraft({
                          ...validationDraft,
                          expectedSource: { type: "METRIC", metricId: e.target.value },
                        })
                      }
                    >
                      <option value="">Выберите метрику</option>
                      {metrics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <FormulaBuilder
                      title="Ожидаемое значение"
                      availableFields={availableFieldsLite}
                      availableMetrics={availableMetricsLite}
                      fieldMeta={numericFieldMeta}
                      expression={validationDraft.expectedSource.expression}
                      onChange={(expr) =>
                        setValidationDraft({
                          ...validationDraft,
                          expectedSource: { type: "EXPRESSION", expression: expr },
                        })
                      }
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Допуск</Label>
                    <Input
                      type="number"
                      value={validationDraft.tolerance ?? 0}
                      onChange={(e) =>
                        setValidationDraft({
                          ...validationDraft,
                          tolerance: Number.parseInt(e.target.value || "0", 10),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Реакция</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={validationDraft.onMismatch === "WARN" ? "default" : "outline"}
                        onClick={() => setValidationDraft({ ...validationDraft, onMismatch: "WARN" })}
                        className="flex-1"
                      >
                        Предупредить
                      </Button>
                      <Button
                        variant={validationDraft.onMismatch === "BLOCK" ? "default" : "outline"}
                        onClick={() => setValidationDraft({ ...validationDraft, onMismatch: "BLOCK" })}
                        className="flex-1"
                      >
                        Блокировать
                      </Button>
                    </div>
                  </div>
                </div>

                {validationModalError && <p className="text-xs text-destructive">{validationModalError}</p>}
              </div>

              <Button className="w-full h-12" onClick={saveValidation} disabled={validateFields.length === 0}>
                {editingValidationId ? "Сохранить" : "Добавить проверку"}
              </Button>
            </div>
          </BottomSheet>
        )}

        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button className="w-full h-12 text-base" size="lg" onClick={handleComplete} disabled={isSaving}>
            Завершить настройку
          </Button>
        </div>
      </div>
    )
  }

  // Step 8: Complete (updated text)
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-orange-50 to-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Success Icon */}
        <div className="flex justify-center">
          <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center shadow-lg">
            <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={1.5} />
          </div>
        </div>

        {/* Message */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">Всё готово!</h1>
          <p className="text-lg text-muted-foreground text-balance leading-relaxed">
            {venueName || "Ваше заведение"} настроено и готово к работе
          </p>
        </div>

        {/* Checklist */}
        <Card className="p-5 space-y-3 text-left">
          <p className="font-semibold text-center">Что дальше?</p>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">Добавьте остальных сотрудников в разделе "Команда"</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">Создайте расписание смен на неделю</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                Отправьте приглашения сотрудникам для установки приложения
              </p>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          <Button className="w-full h-14 text-lg" size="lg" onClick={handleComplete} disabled={isSaving}>
            Перейти на главную
          </Button>
        </div>
      </div>
    </div>
  )
}
