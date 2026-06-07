"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import timezonesFallback from "@/lib/constants/timezones.json"
import { DEFAULT_TIMEZONE, normalizeTimezone } from "@/lib/validation/timezone"
import {
  ChevronLeft,
  Store,
  Users,
  CheckCircle2,
  Plus,
  X,
  AlertCircle,
  Copy,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { TimezoneSelect } from "./timezone-select"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/lib/store/auth-store"
import { copyToClipboard } from "@/lib/utils/copy-to-clipboard"
import { useTranslation } from "@/lib/i18n/context"

type OnboardingStep = 1 | 2 | 5
type OwnerOnboardingMode = "initial" | "new-venue"
type InviteCodeResponse = {
  data: { code: string | null } | null
  error?: string
}

const INITIAL_OWNER_ONBOARDING_STEPS: OnboardingStep[] = [1, 2, 5]
const NEW_VENUE_ONBOARDING_STEPS: OnboardingStep[] = [1, 2, 5]

export default function OwnerOnboarding({
  onComplete,
  mode = "initial",
}: {
  onComplete: () => void
  mode?: OwnerOnboardingMode
}) {
  const isNewVenueMode = mode === "new-venue"
  const { toast } = useToast()
  const { t } = useTranslation()
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
      const message = typeof json?.error === "string" ? json.error : t("onboarding_owner_create_org_failed")
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
      const message = typeof json?.error === "string" ? json.error : t("onboarding_owner_save_step_failed")
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
        throw new Error(typeof json?.error === "string" ? json.error : t("onboarding_owner_get_code_failed"))
      }
      const code = json?.data?.code ?? null
      if (!code) {
        throw new Error(t("onboarding_owner_code_not_found"))
      }
      setInviteCode(code)
    } catch (error: any) {
      setInviteCodeError(error?.message ?? t("onboarding_owner_get_code_failed"))
      setInviteCode(null)
    } finally {
      setInviteCodeLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (step !== 5 || inviteCode) return
    void loadInviteCode()
  }, [step, inviteCode, loadInviteCode])

  const handleCopyInviteCode = async () => {
    const codeToCopy = inviteCode?.trim()
    if (!codeToCopy) return
    const copied = await copyToClipboard(codeToCopy)
    if (copied) {
      toast({ title: t("onboarding_owner_code_copied") })
    } else {
      toast({ title: t("onboarding_owner_copy_failed"), variant: "destructive" })
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
        const message = typeof json?.error === "string" ? json.error : t("onboarding_owner_complete_failed")
        throw new Error(message)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("onboarding_owner_complete_failed")
      toast({ title: t("common_error"), description: message, variant: "destructive" })
      return
    } finally {
      setIsSaving(false)
    }

    try {
      await hydrateAuth()
    } catch (e) {
      console.error("Failed to hydrate auth store after onboarding completion", e)
    }
    onComplete()
  }

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
      const message = error instanceof Error ? error.message : t("onboarding_owner_save_step_failed")
      toast({ title: t("common_error"), description: message, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const prevStep = () => {
    const stepIndex = onboardingSteps.indexOf(step)
    if (stepIndex <= 0) return
    setStep(onboardingSteps[stepIndex - 1])
  }

  // Step 1: Venue Data
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 overflow-auto pb-32">
          <div className="max-w-md mx-auto p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Store className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t("onboarding_owner_step", { step: String(currentStepNumber), total: String(totalSteps) })}
                  </p>
                  <h1 className="text-2xl font-bold">{t("onboarding_owner_venue_title")}</h1>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <Card className="p-5 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="venue-name">{t("onboarding_owner_venue_name_label")}</Label>
                <Input
                  id="venue-name"
                  placeholder={t("onboarding_owner_venue_name_placeholder")}
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("onboarding_owner_timezone_label")}</Label>
                <TimezoneSelect
                  value={timezone}
                  onChange={setTimezone}
                  options={timezoneOptions}
                  placeholder={t("onboarding_owner_timezone_placeholder")}
                />
                <p className="text-xs text-muted-foreground">{t("onboarding_owner_timezone_hint")}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">{t("onboarding_owner_currency_label")}</Label>
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
              <p>{t("onboarding_owner_settings_hint")}</p>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button
            className="w-full h-12 text-base"
            size="lg"
            onClick={nextStep}
            disabled={isSaving || !venueName.trim()}
          >
            {t("onboarding_owner_next")}
          </Button>
        </div>
      </div>
    )
  }

  // Step 2: Positions
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
                    {t("onboarding_owner_step", { step: String(currentStepNumber), total: String(totalSteps) })}
                  </p>
                  <h1 className="text-2xl font-bold">{t("onboarding_owner_positions_title")}</h1>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <Card className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">{t("onboarding_owner_positions_desc")}</p>

              <div className="flex flex-wrap gap-2">
                {positions.map((pos, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="pl-3 pr-2 py-2 text-sm flex items-center gap-2 cursor-pointer hover:bg-secondary/80"
                  >
                    {pos}
                    <button
                      onClick={() => removePosition(index)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder={t("onboarding_owner_new_position_placeholder")}
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
                  onClick={addPosition}
                  size="icon"
                  className="h-11 w-11 flex-shrink-0"
                >
                  <Plus className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </div>
            </Card>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
              <p>{t("onboarding_owner_positions_hint")}</p>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button className="w-full h-12 text-base" size="lg" onClick={nextStep} disabled={isSaving}>
            {t("onboarding_owner_next")}
          </Button>
          <Button variant="ghost" className="w-full" onClick={nextStep} disabled={isSaving}>
            {t("onboarding_owner_skip")}
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
                    {t("onboarding_owner_step", { step: String(currentStepNumber), total: String(totalSteps) })}
                  </p>
                  <h1 className="text-2xl font-bold">{t("onboarding_owner_invite_title")}</h1>
                </div>
              </div>
            </div>

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
                    <h3 className="font-semibold">{t("onboarding_owner_invite_code_title")}</h3>
                    <p className="text-sm text-muted-foreground">{t("onboarding_owner_invite_code_desc")}</p>
                  </div>
                </div>

                <div className="bg-secondary/50 rounded-lg p-4 text-center space-y-2">
                  {inviteCodeLoading && <p className="text-sm text-muted-foreground">{t("onboarding_owner_code_loading")}</p>}
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
                    {t("onboarding_owner_copy_code")}
                  </Button>
                  {inviteCodeError && (
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={() => void loadInviteCode()}
                      disabled={inviteCodeLoading}
                    >
                      {t("onboarding_owner_retry")}
                    </Button>
                  )}
                </div>
              </Card>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
              <p>{t("onboarding_owner_invite_hint")}</p>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4 space-y-3">
          <Button
            className="w-full h-12 text-base"
            size="lg"
            onClick={isLastStep ? handleComplete : nextStep}
            disabled={isSaving}
          >
            {isLastStep ? t("onboarding_owner_finish") : t("onboarding_owner_next")}
          </Button>
          {!isLastStep && (
            <Button variant="ghost" className="w-full" onClick={nextStep} disabled={isSaving}>
              {t("onboarding_owner_skip")}
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Complete screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-orange-50 to-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center shadow-lg">
            <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={1.5} />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold">{t("onboarding_owner_complete_title")}</h1>
          <p className="text-lg text-muted-foreground text-balance leading-relaxed">
            {t("onboarding_owner_complete_subtitle", { name: venueName || t("onboarding_owner_default_venue") })}
          </p>
        </div>

        <Card className="p-5 space-y-3 text-left">
          <p className="font-semibold text-center">{t("onboarding_owner_whats_next")}</p>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">{t("onboarding_owner_next_step1")}</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">{t("onboarding_owner_next_step2")}</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">{t("onboarding_owner_next_step3")}</p>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <Button className="w-full h-14 text-lg" size="lg" onClick={handleComplete} disabled={isSaving}>
            {t("onboarding_owner_go_home")}
          </Button>
        </div>
      </div>
    </div>
  )
}
