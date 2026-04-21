"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Users, CheckCircle2, ChevronLeft, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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
        fullName: name || "Без имени",
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
        throw new Error(msg?.error || "Не удалось сохранить онбординг")
      }
      toast({ title: "Онбординг завершён" })
      onComplete()
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message ?? "Не удалось сохранить", variant: "destructive" })
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
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-orange-600 shadow-lg">
              <Users className="h-8 w-8 text-white" strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-bold">Присоединиться к заведению</h1>
            <p className="text-muted-foreground text-lg leading-relaxed">Введите код приглашения от вашего менеджера</p>
          </div>

          {/* Form */}
          <Card className="p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="invite-code">Код приглашения</Label>
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
                  <p>Неверный код приглашения</p>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">или</span>
              </div>
            </div>

            <Button variant="outline" className="w-full h-12 bg-transparent">
              Открыть ссылку приглашения
            </Button>
          </Card>

          {/* Action */}
          <Button
            className="w-full h-14 text-lg"
            size="lg"
            onClick={validateCode}
            disabled={inviteCode.length < 8 || isInviteLoading}
          >
            {isInviteLoading ? "Проверка..." : "Продолжить"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Код можно получить у администратора вашего заведения
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
                    Шаг {step} из {totalSteps}
                  </p>
                  <h1 className="text-2xl font-bold">Ваш профиль</h1>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${(step / totalSteps) * 100}%` }} />
              </div>
            </div>

            {/* Venue Info */}
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-semibold">{inviteOrganization?.name ?? "Заведение"}</p>
                  <p className="text-sm text-muted-foreground">Вы присоединились к заведению</p>
                </div>
              </div>
            </Card>

            {/* Form */}
            <Card className="p-5 space-y-4">
              <div className="space-y-2">
                <Label>Имя и фамилия</Label>
                <div className="h-12 rounded-lg border border-border bg-background px-3 flex items-center text-sm font-medium">
                  {name || "Без имени"}
                </div>
                <p className="text-xs text-muted-foreground">Это имя будет видно вашему менеджеру</p>
              </div>

              <div className="space-y-2">
                <Label>Должности</Label>
                <div className="rounded-lg border border-border bg-background p-3 space-y-3">
                  {availablePositions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Должности пока не настроены</p>
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
                <p className="text-xs text-muted-foreground">Можно выбрать несколько</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Язык интерфейса (опционально)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="default" className="h-11">
                    Русский
                  </Button>
                  <Button variant="outline" className="h-11 bg-transparent">
                    English
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Bottom Action */}
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border max-w-md mx-auto p-4">
          <Button className="w-full h-12 text-base" size="lg" onClick={nextStep} disabled={!name.trim()}>
            Далее
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
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center shadow-lg">
              <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={1.5} />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-3">
            <h1 className="text-3xl font-bold">Вы готовы к работе!</h1>
            <p className="text-lg text-muted-foreground text-balance leading-relaxed">
              Теперь вы можете открывать смены и отслеживать свои доходы
            </p>
          </div>

          {/* Info Card */}
          <Card className="p-5 space-y-3 text-left">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-semibold">{inviteOrganization?.name ?? "Ваше заведение"}</p>
                <p className="text-sm text-muted-foreground">Ваше заведение</p>
              </div>
            </div>

            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Должности</span>
                <span className="font-medium text-right">{selectedPositionNames.join(", ") || "Не выбраны"}</span>
              </div>
            </div>
          </Card>

          {/* Action */}
          <Button className="w-full h-14 text-lg" size="lg" onClick={handleComplete} disabled={isSaving}>
            Перейти к моим сменам
          </Button>

          <p className="text-sm text-muted-foreground">Ваша первая смена появится, когда менеджер создаст расписание</p>
        </div>
      </div>
    )
  }
}
