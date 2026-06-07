"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Eye, EyeOff, Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/ui/phone-input"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"
import { getPhoneValidationError } from "@/lib/validation/phone"
import { getPasswordRequirementChecks, isStrongPassword, sanitizeAuthInput, sanitizePasswordInput } from "@/lib/validation/password"

type FlattenedValidationError = {
  fieldErrors?: Record<string, string[] | undefined>
  formErrors?: string[]
}

type RegistrationStep = "details" | "verify"

type PendingRegistrationState = {
  email: string
  expiresAt: string
  resendAvailableAt: string
}

function getFirstValidationError(error: FlattenedValidationError | string | null | undefined): string | null {
  if (!error) {
    return null
  }

  if (typeof error === "string") {
    return error
  }

  const fieldError = Object.values(error.fieldErrors ?? {}).flat().find(Boolean)
  if (fieldError) {
    return fieldError
  }

  const formError = error.formErrors?.find(Boolean)
  return formError ?? null
}

function formatCountdown(totalSeconds: number, secondsSuffix: string) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes <= 0) {
    return `${seconds}${secondsSuffix}`
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export default function RegistrationScreen({
  onRegistered,
  redirectTo = "/select-role",
}: {
  onRegistered?: () => void
  redirectTo?: string
}) {
  const { toast } = useToast()
  const router = useRouter()
  const { t, language, setLanguage } = useTranslation()
  const [step, setStep] = useState<RegistrationStep>("details")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [password, setPassword] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistrationState | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [showPassword, setShowPassword] = useState(false)

  const phoneError = getPhoneValidationError(phone)
  const showPhoneError = Boolean(phoneError) && phoneTouched
  const passwordRequirements = getPasswordRequirementChecks(password)
  const hasStartedTypingPassword = password.length > 0
  const isPasswordValid = isStrongPassword(password)
  const isDetailsValid = name.trim().length >= 2 && email.includes("@") && isPasswordValid && !phoneError
  const isVerificationCodeValid = verificationCode.trim().length === 6

  useEffect(() => {
    if (step !== "verify") {
      return
    }

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [step])

  const secondsSuffix = t("auth_seconds_short")

  const resendCountdown = pendingRegistration
    ? Math.max(0, Math.ceil((new Date(pendingRegistration.resendAvailableAt).getTime() - now) / 1000))
    : 0
  const codeExpiryCountdown = pendingRegistration
    ? Math.max(0, Math.ceil((new Date(pendingRegistration.expiresAt).getTime() - now) / 1000))
    : 0

  const maskedEmail = useMemo(() => {
    const value = pendingRegistration?.email ?? email.trim()
    const [localPart, domain = ""] = value.split("@")
    if (!localPart) return value

    const visibleStart = localPart.slice(0, 2)
    const visibleEnd = localPart.length > 4 ? localPart.slice(-1) : ""
    const maskLength = Math.max(2, localPart.length - visibleStart.length - visibleEnd.length)

    return `${visibleStart}${"*".repeat(maskLength)}${visibleEnd}@${domain}`
  }, [email, pendingRegistration?.email])

  const handleStartVerification = async () => {
    if (phoneError) {
      setPhoneTouched(true)
      return
    }
    if (!isDetailsValid) return

    try {
      setIsSubmitting(true)
      setFormError(null)
      const phoneValue = phone.trim()
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phoneValue || undefined,
          password,
        }),
        credentials: "include",
      })
      const msg = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 409) {
          throw new Error(t("auth_email_in_use"))
        }
        if (res.status === 400) {
          throw new Error(getFirstValidationError(msg?.error) || t("auth_invalid_data"))
        }
        throw new Error(msg?.error || t("auth_send_code_failed"))
      }

      setPendingRegistration(msg.pendingRegistration)
      setVerificationCode("")
      setStep("verify")
      setNow(Date.now())
      toast({ title: t("auth_code_sent_toast"), description: t("auth_code_sent_toast_desc") })
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth_send_code_failed")
      setFormError(message)
      toast({
        title: t("common_error"),
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!pendingRegistration || !isVerificationCodeValid) return

    try {
      setIsSubmitting(true)
      setFormError(null)
      const res = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: pendingRegistration.email,
          code: verificationCode.trim(),
        }),
      })
      const msg = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error(getFirstValidationError(msg?.error) || msg?.error || t("auth_wrong_reset_code"))
        }
        throw new Error(msg?.error || t("auth_verify_email_failed"))
      }

      toast({ title: t("auth_email_verified"), description: t("auth_email_verified_desc") })
      onRegistered?.()
      await router.replace(redirectTo)
      router.refresh()
      if (redirectTo) window.location.href = redirectTo
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth_verify_email_failed")
      setFormError(message)
      toast({
        title: t("common_error"),
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (step === "verify") {
      await handleVerifyCode()
      return
    }

    await handleStartVerification()
  }

  const handleResend = async () => {
    if (!pendingRegistration || resendCountdown > 0) return

    try {
      setIsResending(true)
      setFormError(null)
      const res = await fetch("/api/auth/register/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: pendingRegistration.email,
        }),
      })
      const msg = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(msg?.error || t("auth_resend_code_failed"))
      }

      setPendingRegistration(msg.pendingRegistration)
      setVerificationCode("")
      setNow(Date.now())
      toast({ title: t("auth_code_resent") })
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth_resend_code_failed")
      setFormError(message)
      toast({
        title: t("common_error"),
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsResending(false)
    }
  }

  const handleBackToDetails = () => {
    setStep("details")
    setPendingRegistration(null)
    setVerificationCode("")
    setFormError(null)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold">
                {step === "details" ? t("auth_register_title") : t("auth_verify_email_title")}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {step === "details" ? t("auth_register_subtitle") : t("auth_verify_email_subtitle")}
              </p>
            </div>

            <div className="flex items-center gap-1 ml-4 mt-1 shrink-0">
              <button
                type="button"
                onClick={() => setLanguage("ru")}
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded transition-colors",
                  language === "ru"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                RU
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded transition-colors",
                  language === "en"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {step === "details" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">{t("auth_name_label")}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => {
                    setName(sanitizeAuthInput(e.target.value))
                    setFormError(null)
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(sanitizeAuthInput(e.target.value))
                    setFormError(null)
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t("auth_phone_label")}</Label>
                <div className="space-y-1.5">
                  <PhoneInput
                    id="phone"
                    value={phone}
                    onChange={(nextValue) => {
                      setPhone(nextValue)
                      setFormError(null)
                    }}
                    onBlur={() => setPhoneTouched(true)}
                    ariaInvalid={showPhoneError}
                    ariaDescribedBy={showPhoneError ? "registration-phone-error" : undefined}
                  />
                  {showPhoneError ? (
                    <p id="registration-phone-error" className="text-xs text-destructive">
                      {phoneError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("auth_phone_hint")}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth_password_label")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(sanitizePasswordInput(e.target.value))
                      setFormError(null)
                    }}
                    minLength={8}
                    maxLength={64}
                    autoComplete="new-password"
                    aria-invalid={hasStartedTypingPassword && !isPasswordValid}
                    aria-describedby="registration-password-requirements"
                    className={cn(
                      "pr-10",
                      hasStartedTypingPassword && isPasswordValid && [
                        "border-emerald-300 bg-emerald-50/60",
                        "focus-visible:border-emerald-400 focus-visible:ring-emerald-200/60",
                      ],
                    )}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? t("auth_hide_password") : t("auth_show_password")}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <div id="registration-password-requirements" className="space-y-1.5">
                  <p className="text-[11px] font-medium leading-4 text-muted-foreground">
                    {t("auth_password_requirements")}
                  </p>
                  <ul className="space-y-1">
                    {passwordRequirements.map((requirement) => {
                      const isUnmet = hasStartedTypingPassword && !requirement.met

                      return (
                        <li
                          key={requirement.id}
                          className={cn(
                            "flex items-center gap-2 text-[11px] leading-4 transition-colors",
                            requirement.met && "text-emerald-700",
                            isUnmet && "text-destructive",
                            !requirement.met && !hasStartedTypingPassword && "text-muted-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                              requirement.met && "border-emerald-500 bg-emerald-500 text-white",
                              isUnmet && "border-destructive/50 bg-destructive/10 text-destructive",
                              !requirement.met &&
                                !hasStartedTypingPassword &&
                                "border-border bg-background text-transparent",
                            )}
                            aria-hidden="true"
                          >
                            {requirement.met ? (
                              <Check className="h-3 w-3" strokeWidth={2.4} />
                            ) : isUnmet ? (
                              <X className="h-3 w-3" strokeWidth={2.4} />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            )}
                          </span>
                          <span>{t(`password_req_${requirement.id}` as Parameters<typeof t>[0])}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm">
                  {t("auth_code_sent_to", { email: maskedEmail })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {codeExpiryCountdown > 0
                    ? t("auth_code_valid_for", { time: formatCountdown(codeExpiryCountdown, secondsSuffix) })
                    : t("auth_code_expired")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verification-code">{t("auth_code_label")}</Label>
                <div className="space-y-3">
                  <InputOTP
                    id="verification-code"
                    value={verificationCode}
                    onChange={(value) => {
                      setVerificationCode(value)
                      setFormError(null)
                    }}
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    containerClassName="justify-center"
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }, (_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <p className="text-xs text-center text-muted-foreground">{t("auth_enter_digits")}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  className="px-0"
                  onClick={handleBackToDetails}
                  disabled={isSubmitting || isResending}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("common_back")}
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="px-0"
                  onClick={handleResend}
                  disabled={isSubmitting || isResending || resendCountdown > 0}
                >
                  {isResending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("auth_sending")}
                    </>
                  ) : resendCountdown > 0 ? (
                    t("auth_resend_in", { time: formatCountdown(resendCountdown, secondsSuffix) })
                  ) : (
                    t("auth_resend_code")
                  )}
                </Button>
              </div>
            </>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={
              isSubmitting ||
              (step === "details" ? !isDetailsValid : !isVerificationCodeValid || codeExpiryCountdown <= 0)
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {step === "details" ? t("auth_sending") : t("auth_checking")}
              </>
            ) : step === "details" ? (
              t("auth_register_button")
            ) : (
              t("auth_verify_code_button")
            )}
          </Button>

          {formError && <p className="text-sm text-destructive text-center">{formError}</p>}
        </form>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">{t("auth_has_account")} </span>
          <Link href="/login" className="text-primary hover:underline">
            {t("auth_sign_in_link")}
          </Link>
        </div>
      </Card>
    </div>
  )
}
