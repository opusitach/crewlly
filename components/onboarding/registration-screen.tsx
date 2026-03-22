"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/ui/phone-input"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getPhoneValidationError } from "@/lib/validation/phone"
import { getPasswordRequirementChecks, isStrongPassword } from "@/lib/validation/password"

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

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes <= 0) {
    return `${seconds}с`
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
          throw new Error("Email уже используется")
        }
        if (res.status === 400) {
          throw new Error(getFirstValidationError(msg?.error) || "Проверьте корректность данных")
        }
        throw new Error(msg?.error || "Не удалось отправить код подтверждения")
      }

      setPendingRegistration(msg.pendingRegistration)
      setVerificationCode("")
      setStep("verify")
      setNow(Date.now())
      toast({ title: "Код отправлен", description: "Проверьте почту и введите код" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить код подтверждения"
      setFormError(message)
      toast({
        title: "Ошибка",
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
          throw new Error(getFirstValidationError(msg?.error) || msg?.error || "Неверный код")
        }
        throw new Error(msg?.error || "Не удалось подтвердить email")
      }

      toast({ title: "Email подтвержден", description: "Теперь выберите роль" })
      onRegistered?.()
      await router.replace(redirectTo)
      router.refresh()
      if (redirectTo) window.location.href = redirectTo
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось подтвердить email"
      setFormError(message)
      toast({
        title: "Ошибка",
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
        throw new Error(msg?.error || "Не удалось отправить код повторно")
      }

      setPendingRegistration(msg.pendingRegistration)
      setVerificationCode("")
      setNow(Date.now())
      toast({ title: "Код отправлен повторно" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить код повторно"
      setFormError(message)
      toast({
        title: "Ошибка",
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
          <h1 className="text-2xl font-bold">{step === "details" ? "Регистрация" : "Подтверждение email"}</h1>
          <p className="text-sm text-muted-foreground">
            {step === "details" ? "Создайте аккаунт по email" : "Введите 6-значный код из письма"}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {step === "details" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Имя</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
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
                    setEmail(e.target.value)
                    setFormError(null)
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Номер телефона</Label>
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
                    <p className="text-xs text-muted-foreground">Выберите код страны и введите номер без букв</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setFormError(null)
                  }}
                  minLength={8}
                  maxLength={64}
                  autoComplete="new-password"
                  aria-invalid={hasStartedTypingPassword && !isPasswordValid}
                  aria-describedby="registration-password-requirements"
                  className={cn(
                    hasStartedTypingPassword && isPasswordValid && [
                      "border-emerald-300 bg-emerald-50/60",
                      "focus-visible:border-emerald-400 focus-visible:ring-emerald-200/60",
                    ],
                  )}
                  required
                />
                <div id="registration-password-requirements" className="space-y-1.5">
                  <p className="text-[11px] font-medium leading-4 text-muted-foreground">Пароль должен содержать:</p>
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
                          <span>{requirement.label}</span>
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
                  Код отправлен на <span className="font-medium">{maskedEmail}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {codeExpiryCountdown > 0
                    ? `Код действует еще ${formatCountdown(codeExpiryCountdown)}`
                    : "Код истек. Отправьте новый код."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verification-code">Код подтверждения</Label>
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
                  <p className="text-xs text-center text-muted-foreground">Введите 6 цифр из письма</p>
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
                  Назад
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
                      Отправка...
                    </>
                  ) : resendCountdown > 0 ? (
                    `Отправить снова через ${formatCountdown(resendCountdown)}`
                  ) : (
                    "Отправить код еще раз"
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
                {step === "details" ? "Отправка..." : "Проверка..."}
              </>
            ) : step === "details" ? (
              "Зарегистрироваться"
            ) : (
              "Подтвердить код"
            )}
          </Button>

          {formError && <p className="text-sm text-destructive text-center">{formError}</p>}
        </form>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Уже есть аккаунт? </span>
          <Link href="/login" className="text-primary hover:underline">
            Войти
          </Link>
        </div>
      </Card>
    </div>
  )
}
