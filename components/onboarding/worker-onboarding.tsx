"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Users, CheckCircle2, ChevronLeft, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "@/lib/i18n/context"

type WorkerStep = 1 | 2 | 3
type InvitationOrganization = { id: string; name: string }
type PositionOption = { id: string; name: string }

export default function WorkerOnboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<WorkerStep>(1)
  const [inviteCode, setInviteCode] = useState("")
  const [name, setName] = useState("")
  const [hasError, setHasError] = useState(false)
  const [inviteOrganization, setInviteOrganization] = useState<InvitationOrganization | null>(null)
  const [availablePositions, setAvailablePositions] = useState<PositionOption[]>([])
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([])
  const [isInviteLoading, setIsInviteLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()
  const { t } = useTranslation()

  const totalSteps = 3
  const selectedPositionNames = availablePositions
    .filter((position) => selectedPositionIds.includes(position.id))
    .map((position) => position.name)

  const nextStep = () => {
    if (step < 3) {
      setStep((step + 1) as WorkerStep)
    }
  }

  const prevStep = () => {
    if (step > 1) {
      setStep((step - 1) as WorkerStep)
    }
  }

  const validateCode = async () => {
    const trimmed = inviteCode.trim()
    if (trimmed.length < 8) {
      setHasError(true)
      return
    }

    try {
      setIsInviteLoading(true)
      setHasError(false)
      const res = await fetch(`/api/onboarding/employee?invitationCode=${encodeURIComponent(trimmed)}`, {
        cache: "no-store",
      })
      if (!res.ok) {
        setInviteOrganization(null)
        setAvailablePositions([])
        setSelectedPositionIds([])
        setHasError(true)
        return
      }
      const json = await res.json()
      const organization = json?.data?.organization
      const positions = Array.isArray(json?.data?.positions) ? json.data.positions : []
      if (!organization?.name) {
        setInviteOrganization(null)
        setAvailablePositions([])
        setSelectedPositionIds([])
        setHasError(true)
        return
      }
      setInviteOrganization(organization)
      setAvailablePositions(positions)
      setSelectedPositionIds((prev) => prev.filter((id) => positions.some((pos: PositionOption) => pos.id === id)))
      nextStep()
    } catch {
      setInviteOrganization(null)
      setAvailablePositions([])
      setSelectedPositionIds([])
      setHasError(true)
    } finally {
      setIsInviteLoading(false)
    }
  }

  const handleComplete = async () => {
    try {
      setIsSaving(true)
      const payload = {
        fullName: name || t("onboarding_worker_no_name"),
        invitationCode: inviteCode || undefined,
        positionIds: selectedPositionIds.length > 0 ? selectedPositionIds : undefined,
        data: {},
      }
      const res = await fetch("/api/onboarding/employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || t("onboarding_worker_complete_failed"))
      }
      toast({ title: t("onboarding_worker_complete_success") })
      onComplete()
    } catch (error: any) {
      toast({
        title: t("common_error"),
        description: error.message ?? t("onboarding_worker_save_failed"),
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/onboarding/employee", { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        if (json?.data) {
          setName(json.data.user?.fullName ?? "")
        }
      }
    }
    void load()
  }, [])

  // Step 1: Join Venue
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-orange-600 shadow-lg">
              <Users className="h-8 w-8 text-white" strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-bold">{t("onboarding_worker_join_title")}</h1>
            <p className="text-muted-foreground text-lg leading-relaxed">{t("onboarding_worker_join_subtitle")}</p>
          </div>

          <Card className="p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="invite-code">{t("onboarding_worker_invite_code_label")}</Label>
              <Input
                id="invite-code"
                placeholder="ABC-123"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase())
                  setHasError(false)
                  setInviteOrganization(null)
                  setAvailablePositions([])
                  setSelectedPositionIds([])
                }}
                className={`h-14 text-center text-xl tracking-widest ${hasError ? "border-destructive" : ""}`}
                maxLength={12}
              />
              {hasError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
                  <p>{t("onboarding_worker_invalid_code")}</p>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">{t("onboarding_worker_or")}</span>
              </div>
            </div>

            <Button variant="outline" className="w-full h-12 bg-transparent">
              {t("onboarding_worker_open_invite_link")}
            </Button>
          </Card>

          <Button
            className="w-full h-14 text-lg"
            size="lg"
            onClick={validateCode}
            disabled={inviteCode.length < 8 || isInviteLoading}
          >
            {isInviteLoading ? t("onboarding_worker_checking") : t("onboarding_worker_continue")}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t("onboarding_worker_code_hint")}
          </p>
        </div>
      </div>
    )
  }

  // Step 2: Profile Setup
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
                    {t("onboarding_worker_step", { step: String(step), total: String(totalSteps) })}
                  </p>
                  <h1 className="text-2xl font-bold">{t("onboarding_worker_profile_title")}</h1>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${(step / totalSteps) * 100}%` }} />
              </div>
            </div>

            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-semibold">{inviteOrganization?.name ?? t("onboarding_worker_your_venue")}</p>
                  <p className="text-sm text-muted-foreground">{t("onboarding_worker_joined_venue")}</p>
                </div>
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="space-y-2">
                <Label>{t("onboarding_worker_name_label")}</Label>
                <div className="h-12 rounded-lg border border-border bg-background px-3 flex items-center text-sm font-medium">
                  {name || t("onboarding_worker_no_name")}
                </div>
                <p className="text-xs text-muted-foreground">{t("onboarding_worker_name_hint")}</p>
              </div>

              <div className="space-y-2">
                <Label>{t("onboarding_worker_positions_label")}</Label>
                <div className="rounded-lg border border-border bg-background p-3 space-y-3">
                  {availablePositions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("onboarding_worker_no_positions")}</p>
                  ) : (
                    availablePositions.map((position) => (
                      <div key={position.id} className="flex items-start gap-3">
                        <Checkbox
                          id={`position-${position.id}`}
                          checked={selectedPositionIds.includes(position.id)}
                          onCheckedChange={(checked) => {
                            setSelectedPositionIds((prev) =>
                              checked === true
                                ? [...prev, position.id]
                                : prev.filter((id) => id !== position.id),
                            )
                          }}
                        />
                        <Label htmlFor={`position-${position.id}`} className="text-sm font-medium cursor-pointer">
                          {position.name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t("onboarding_worker_positions_hint")}</p>
              </div>
            </Card>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4">
          <Button className="w-full h-12 text-base" size="lg" onClick={nextStep} disabled={!name.trim()}>
            {t("onboarding_worker_next")}
          </Button>
        </div>
      </div>
    )
  }

  // Step 3: Complete
  if (step === 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-orange-50 to-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="flex justify-center">
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center shadow-lg">
              <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={1.5} />
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-bold">{t("onboarding_worker_ready_title")}</h1>
            <p className="text-lg text-muted-foreground text-balance leading-relaxed">
              {t("onboarding_worker_ready_subtitle")}
            </p>
          </div>

          <Card className="p-5 space-y-3 text-left">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-semibold">{inviteOrganization?.name ?? t("onboarding_worker_your_venue")}</p>
                <p className="text-sm text-muted-foreground">{t("onboarding_worker_your_venue")}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("onboarding_worker_positions_summary")}</span>
                <span className="font-medium text-right">
                  {selectedPositionNames.join(", ") || t("onboarding_worker_positions_none")}
                </span>
              </div>
            </div>
          </Card>

          <Button className="w-full h-14 text-lg" size="lg" onClick={handleComplete} disabled={isSaving}>
            {t("onboarding_worker_go_to_shifts")}
          </Button>

          <p className="text-sm text-muted-foreground">{t("onboarding_worker_shifts_hint")}</p>
        </div>
      </div>
    )
  }
}
