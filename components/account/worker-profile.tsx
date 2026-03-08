"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/ui/phone-input"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, Mail, Phone, Edit2, Camera, LogOut, Clock3, Sparkles, TrendingUp, Wallet } from "lucide-react"
import { ImagePreview } from "@/components/ui/image-preview"
import { PAY_COMPONENT_LABELS, type PayComponent } from "@/lib/pay-components"
import { useAuthStore } from "@/lib/store/auth-store"
import { cn } from "@/lib/utils"
import { getEmailValidationError } from "@/lib/validation/email"
import { formatPhoneForDisplay, getPhoneValidationError } from "@/lib/validation/phone"

interface WorkerProfileProps {
  onBack: () => void
  onLogout: () => void
  hideHeader?: boolean
  variant?: "page" | "sheet"
}

type WorkerCompensationSummary = {
  totalSalaryCents: number
  totalTipsCents: number
  totalMinutesWorked: number
  shiftsCount: number
  currency: string | null
}

const EMPTY_COMPENSATION_SUMMARY: WorkerCompensationSummary = {
  totalSalaryCents: 0,
  totalTipsCents: 0,
  totalMinutesWorked: 0,
  shiftsCount: 0,
  currency: null,
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

const formatWorkedTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} мин`
  if (rest === 0) return `${hours} ч`
  return `${hours} ч ${rest} мин`
}

const formatPercent = (rateBp: number) => {
  const percent = rateBp / 100
  return Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

const formatPayValue = (component: PayComponent, currency: string) => {
  if (component.componentType === "percent_revenue" && component.rateBp != null) {
    return `${formatPercent(component.rateBp)}% от выручки`
  }

  if (component.amountCents == null) {
    return "Не задано"
  }

  const roundedValue = Math.round(component.amountCents / 100)
  if (component.componentType === "hourly") {
    return `${roundedValue} ${currency}/ч`
  }
  if (component.componentType === "fixed_shift") {
    return `${roundedValue} ${currency} за смену`
  }
  return `${roundedValue} ${currency}`
}

export default function WorkerProfile({
  onBack,
  onLogout,
  hideHeader = false,
  variant = "page",
}: WorkerProfileProps) {
  const updateUser = useAuthStore((state) => state.updateUser)
  const organization = useAuthStore((state) => state.organization)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [emailTouched, setEmailTouched] = useState(false)
  const [emailValidationRequested, setEmailValidationRequested] = useState(false)
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [phoneValidationRequested, setPhoneValidationRequested] = useState(false)
  const [isCompensationLoading, setIsCompensationLoading] = useState(true)
  const [compensationError, setCompensationError] = useState<string | null>(null)
  const [compensationSummary, setCompensationSummary] = useState<WorkerCompensationSummary>(EMPTY_COMPENSATION_SUMMARY)
  const compensationRequestIdRef = useRef(0)
  const profileRequestIdRef = useRef(0)
  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: null as string | null,
    avatarUrl: "",
    positions: [] as string[],
    payComponents: [] as PayComponent[],
  })
  const emailError = getEmailValidationError(profileData.email)
  const phoneError = getPhoneValidationError(profileData.phone)
  const showEmailError = isEditing && Boolean(emailError) && (emailTouched || emailValidationRequested)
  const showPhoneError = isEditing && Boolean(phoneError) && (phoneTouched || phoneValidationRequested)
  const payCurrency = compensationSummary.currency ?? organization?.currency ?? "CZK"
  const activePayComponents = useMemo(
    () =>
      profileData.payComponents.filter((component) => {
        if (!component?.isActive) return false
        if (component.componentType === "percent_revenue") return component.rateBp != null
        return component.amountCents != null
      }),
    [profileData.payComponents],
  )
  const salaryCaption = compensationError
    ? compensationError
    : compensationSummary.shiftsCount > 0
      ? "Актуально за текущий месяц"
      : "Смен в этом месяце пока не было"

  const loadProfile = useCallback(async () => {
    const requestId = profileRequestIdRef.current + 1
    profileRequestIdRef.current = requestId

    try {
      const res = await fetch("/api/onboarding/employee", { cache: "no-store", credentials: "include" })
      if (!res.ok) return

      const json = await res.json().catch(() => null)
      if (profileRequestIdRef.current !== requestId) return

      const user = json?.data?.user
      const employeePositions = Array.isArray(json?.data?.employee?.employeePositions)
        ? json.data.employee.employeePositions
        : []
      const payComponents = Array.isArray(json?.data?.employee?.payComponents)
        ? (json.data.employee.payComponents as PayComponent[])
        : []

      const positions: string[] = Array.from(
        new Set(
          employeePositions
            .map((ep: any) => ep?.position)
            .filter((pos: any): pos is { name: string; isActive?: boolean } => typeof pos?.name === "string")
            .filter((pos: { name: string; isActive?: boolean }) => pos.isActive !== false)
            .map((pos: { name: string }) => pos.name),
        ),
      )

      setProfileData((prev) => ({
        ...prev,
        name: user?.fullName ?? prev.name,
        email: user?.email ?? prev.email,
        phone: user?.phone ?? null,
        avatarUrl: user?.avatarUrl ?? prev.avatarUrl,
        positions,
        payComponents,
      }))
    } catch {
      // Keep the last successful snapshot in the profile if refresh fails.
    }
  }, [])

  const loadCompensationSummary = useCallback(
    async (options?: { silent?: boolean }) => {
      const requestId = compensationRequestIdRef.current + 1
      compensationRequestIdRef.current = requestId
      const silent = options?.silent === true

      if (!silent) {
        setIsCompensationLoading(true)
      }
      setCompensationError(null)

      try {
        const now = new Date()
        const params = new URLSearchParams({
          dateFrom: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
          dateTo: toDateInputValue(now),
        })

        const res = await fetch(`/api/worker/earnings?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
        })

        if (!res.ok) {
          throw new Error("Не удалось загрузить зарплату")
        }

        const json = await res.json().catch(() => null)
        if (compensationRequestIdRef.current !== requestId) return

        const rawSummary = json?.data?.summary ?? {}
        setCompensationSummary({
          totalSalaryCents: Number.isInteger(rawSummary.totalSalaryCents) ? Number(rawSummary.totalSalaryCents) : 0,
          totalTipsCents: Number.isInteger(rawSummary.totalTipsCents) ? Number(rawSummary.totalTipsCents) : 0,
          totalMinutesWorked: Number.isInteger(rawSummary.totalMinutesWorked) ? Number(rawSummary.totalMinutesWorked) : 0,
          shiftsCount: Number.isInteger(rawSummary.shiftsCount) ? Number(rawSummary.shiftsCount) : 0,
          currency:
            typeof rawSummary.currency === "string"
              ? rawSummary.currency
              : organization?.currency ?? EMPTY_COMPENSATION_SUMMARY.currency,
        })
      } catch {
        if (compensationRequestIdRef.current !== requestId) return
        setCompensationSummary((prev) => ({
          ...EMPTY_COMPENSATION_SUMMARY,
          currency: prev.currency ?? organization?.currency ?? EMPTY_COMPENSATION_SUMMARY.currency,
        }))
        setCompensationError("Не удалось загрузить актуальную зарплату")
      } finally {
        if (compensationRequestIdRef.current !== requestId || silent) return
        setIsCompensationLoading(false)
      }
    },
    [organization?.currency],
  )

  useEffect(() => {
    void loadProfile()
    void loadCompensationSummary()
  }, [loadProfile, loadCompensationSummary])

  useEffect(() => {
    if (isEditing) return

    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      void loadProfile()
      void loadCompensationSummary({ silent: true })
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh()
      }
    }

    const intervalId = window.setInterval(refresh, 60_000)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [isEditing, loadProfile, loadCompensationSummary])

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const resetValidationState = () => {
    setEmailTouched(false)
    setEmailValidationRequested(false)
    setPhoneTouched(false)
    setPhoneValidationRequested(false)
  }

  const requestEmailValidation = () => {
    setEmailTouched(true)
    setEmailValidationRequested(true)
  }

  const requestPhoneValidation = () => {
    setPhoneTouched(true)
    setPhoneValidationRequested(true)
  }

  const handleEmailChange = (value: string) => {
    setProfileData((prev) => ({ ...prev, email: value }))
    setSaveError(null)
    setEmailTouched(true)
  }

  const handlePhoneChange = (value: string) => {
    setProfileData((prev) => ({ ...prev, phone: value || null }))
    setSaveError(null)
    setPhoneTouched(true)
  }

  const finishEditing = async () => {
    if (isSaving) return

    if (emailError) {
      requestEmailValidation()
      return
    }
    if (phoneError) {
      requestPhoneValidation()
      return
    }

    const trimmedEmail = profileData.email.trim()
    const trimmedPhone = profileData.phone?.trim() || null

    setSaveError(null)
    setIsSaving(true)

    try {
      await updateUser({ email: trimmedEmail, phone: trimmedPhone })
      setProfileData((prev) => ({ ...prev, email: trimmedEmail, phone: trimmedPhone }))
      resetValidationState()
      setIsEditing(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить профиль")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditToggle = async () => {
    if (isSaving) return

    if (!isEditing) {
      resetValidationState()
      setSaveError(null)
      setIsEditing(true)
      return
    }

    await finishEditing()
  }

  return (
    <div
      className={cn(
        variant === "page" ? "min-h-screen bg-background max-w-md mx-auto pb-6" : "pb-2",
      )}
    >
      {!hideHeader && (
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="p-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-lg font-semibold">Профиль</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleEditToggle}
                className="rounded-full h-9 w-9"
              >
                <Edit2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        {hideHeader && (
          <div className="flex justify-end">
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              onClick={handleEditToggle}
            >
              <Edit2 className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
              {isEditing ? "Готово" : "Редактировать"}
            </Button>
          </div>
        )}

        <Card className="p-4 flex flex-col items-center gap-3 overflow-hidden">
          <div className="relative">
            {profileData.avatarUrl ? (
              <ImagePreview
                src={profileData.avatarUrl || "/placeholder.svg"}
                alt={profileData.name || "User"}
                triggerClassName="h-20 w-20 rounded-full"
                imageClassName="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-2xl font-semibold">
                {getInitials(profileData.name || "Без имени")}
              </div>
            )}
            {isEditing && (
              <button className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-primary text-white flex items-center justify-center shadow-lg">
                <Camera className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">{profileData.name || "Без имени"}</h2>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {profileData.positions.map((position) => (
                <Badge key={position} variant="secondary" className="text-xs">
                  {position}
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden border-primary/15 bg-gradient-to-br from-primary/10 via-background to-background p-4">
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/80 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-primary/80">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.7} />
                  Зарплата
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  {isCompensationLoading ? "—" : formatMoney(compensationSummary.totalSalaryCents, payCurrency)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{salaryCaption}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Wallet className="h-5 w-5" strokeWidth={1.7} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-3 shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Смены
                </div>
                <p className="mt-2 text-lg font-semibold">{compensationSummary.shiftsCount}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-3 shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Отработано
                </div>
                <p className="mt-2 text-lg font-semibold">{formatWorkedTime(compensationSummary.totalMinutesWorked)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Условия оплаты
                </p>
                <span className="text-[11px] text-muted-foreground">Обновляется автоматически</span>
              </div>

              {activePayComponents.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activePayComponents.map((component) => (
                    <div
                      key={component.componentType}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm",
                        component.componentType === "hourly" && "border-emerald-200 bg-emerald-50 text-emerald-900",
                        component.componentType === "fixed_shift" && "border-amber-200 bg-amber-50 text-amber-900",
                        component.componentType === "percent_revenue" && "border-sky-200 bg-sky-50 text-sky-900",
                      )}
                    >
                      <span className="text-[11px] uppercase tracking-wide opacity-70">
                        {PAY_COMPONENT_LABELS[component.componentType]}
                      </span>
                      <span>{formatPayValue(component, payCurrency)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                  Условия оплаты пока не настроены
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">Контактная информация</h3>

          <div className="space-y-2">
            <Label htmlFor="email" className={`text-xs ${showEmailError ? "text-destructive" : "text-muted-foreground"}`}>
              Email
            </Label>
            {isEditing ? (
              <div className="space-y-1.5">
                <Input
                  id="email"
                  type="email"
                  value={profileData.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  autoComplete="email"
                  placeholder="name@example.com"
                  title="Введите email латиницей в формате name@example.com"
                  aria-invalid={showEmailError || undefined}
                  aria-describedby={showEmailError ? "worker-email-error" : undefined}
                  className="h-9"
                />
                {showEmailError && (
                  <p id="worker-email-error" className="text-xs text-destructive">
                    {emailError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm truncate">{profileData.email || "Не указан"}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className={`text-xs ${showPhoneError ? "text-destructive" : "text-muted-foreground"}`}>
              Телефон
            </Label>
            {isEditing ? (
              <div className="space-y-1.5">
                <PhoneInput
                  id="phone"
                  value={profileData.phone}
                  onChange={handlePhoneChange}
                  onBlur={() => setPhoneTouched(true)}
                  ariaInvalid={showPhoneError}
                  ariaDescribedBy={showPhoneError ? "worker-phone-error" : undefined}
                />
                {showPhoneError && (
                  <p id="worker-phone-error" className="text-xs text-destructive">
                    {phoneError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm truncate">{formatPhoneForDisplay(profileData.phone) || "Не указан"}</span>
              </div>
            )}
          </div>
        </Card>

        {isEditing && (
          <div className="space-y-2">
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <Button className="w-full h-10" onClick={finishEditing} disabled={Boolean(emailError || phoneError) || isSaving}>
              {isSaving ? "Сохраняем..." : "Сохранить изменения"}
            </Button>
          </div>
        )}

        <Button variant="destructive" className="w-full h-10 mt-2" onClick={onLogout}>
          <LogOut className="h-4 w-4 mr-2" strokeWidth={1.5} />
          Выйти
        </Button>
      </div>
    </div>
  )
}
