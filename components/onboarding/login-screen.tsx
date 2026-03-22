"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Loader2, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getPasswordRequirementChecks, isStrongPassword } from "@/lib/validation/password"

type FlattenedValidationError = {
  fieldErrors?: Record<string, string[] | undefined>
  formErrors?: string[]
}

type LoginView = "login" | "requestReset" | "verifyReset" | "confirmReset"

type PendingPasswordResetState = {
  email: string
  expiresAt: string
  resendAvailableAt: string
}

type VerifiedPasswordResetState = {
  email: string
  resetToken: string
  resetTokenExpiresAt: string
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

  return error.formErrors?.find(Boolean) ?? null
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes <= 0) {
    return `${seconds}с`
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function getMaskedEmail(value: string) {
  const [localPart, domain = ""] = value.trim().split("@")
  if (!localPart) return value

  const visibleStart = localPart.slice(0, 2)
  const visibleEnd = localPart.length > 4 ? localPart.slice(-1) : ""
  const maskLength = Math.max(2, localPart.length - visibleStart.length - visibleEnd.length)

  return `${visibleStart}${"*".repeat(maskLength)}${visibleEnd}@${domain}`
}

export default function LoginScreen({ redirectTo = "/select-role" }: { redirectTo?: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [view, setView] = useState<LoginView>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [resetCode, setResetCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [pendingPasswordReset, setPendingPasswordReset] = useState<PendingPasswordResetState | null>(null)
  const [verifiedPasswordReset, setVerifiedPasswordReset] = useState<VerifiedPasswordResetState | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const isLoginValid = email.includes("@") && password.trim().length >= 1
  const isResetEmailValid = email.includes("@")
  const isResetCodeValid = resetCode.trim().length === 6
  const newPasswordRequirements = getPasswordRequirementChecks(newPassword)
  const hasStartedTypingNewPassword = newPassword.length > 0
  const isNewPasswordValid = isStrongPassword(newPassword)

  useEffect(() => {
    if (view !== "verifyReset" && view !== "confirmReset") {
      return
    }

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [view])

  const resendCountdown = pendingPasswordReset
    ? Math.max(0, Math.ceil((new Date(pendingPasswordReset.resendAvailableAt).getTime() - now) / 1000))
    : 0
  const codeExpiryCountdown = pendingPasswordReset
    ? Math.max(0, Math.ceil((new Date(pendingPasswordReset.expiresAt).getTime() - now) / 1000))
    : 0
  const resetSessionCountdown = verifiedPasswordReset
    ? Math.max(0, Math.ceil((new Date(verifiedPasswordReset.resetTokenExpiresAt).getTime() - now) / 1000))
    : 0

  const maskedEmail = useMemo(() => {
    const value = verifiedPasswordReset?.email ?? pendingPasswordReset?.email ?? email.trim()
    return getMaskedEmail(value)
  }, [email, pendingPasswordReset?.email, verifiedPasswordReset?.email])

  const resetRecoveryState = () => {
    setResetCode("")
    setNewPassword("")
    setPendingPasswordReset(null)
    setVerifiedPasswordReset(null)
  }

  const returnToLogin = () => {
    setView("login")
    setFormError(null)
    setPassword("")
    resetRecoveryState()
  }

  const openPasswordRecovery = () => {
    setView("requestReset")
    setFormError(null)
    setPassword("")
    resetRecoveryState()
  }

  const handleLogin = async () => {
    if (!isLoginValid) return

    try {
      setIsSubmitting(true)
      setFormError(null)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: "include",
      })

      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        if (res.status === 401) {
          throw new Error(msg?.error || "Неверный email или пароль")
        }
        throw new Error(msg?.error || "Не удалось войти")
      }

      toast({ title: "Вход выполнен" })
      await router.replace(redirectTo)
      router.refresh()
      if (redirectTo) window.location.href = redirectTo
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось войти"
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

  const handleRequestReset = async () => {
    if (!isResetEmailValid) return

    try {
      setIsSubmitting(true)
      setFormError(null)
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
        }),
      })
      const msg = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error(getFirstValidationError(msg?.error) || "Проверьте корректность email")
        }
        throw new Error(msg?.error || "Не удалось отправить код восстановления")
      }

      setPendingPasswordReset(msg.pendingPasswordReset)
      setVerifiedPasswordReset(null)
      setResetCode("")
      setNewPassword("")
      setView("verifyReset")
      setNow(Date.now())
      toast({
        title: "Код отправлен",
        description: "Если аккаунт существует, письмо уже в пути",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить код восстановления"
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

  const handleVerifyResetCode = async () => {
    if (!pendingPasswordReset || !isResetCodeValid) return

    try {
      setIsSubmitting(true)
      setFormError(null)
      const res = await fetch("/api/auth/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: pendingPasswordReset.email,
          code: resetCode.trim(),
        }),
      })
      const msg = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error(getFirstValidationError(msg?.error) || msg?.error || "Неверный код")
        }
        throw new Error(msg?.error || "Не удалось подтвердить код")
      }

      setVerifiedPasswordReset(msg.passwordReset)
      setNewPassword("")
      setView("confirmReset")
      setNow(Date.now())
      toast({ title: "Код подтвержден", description: "Теперь задайте новый пароль" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось подтвердить код"
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

  const handleConfirmReset = async () => {
    if (!verifiedPasswordReset || !isNewPasswordValid) return

    try {
      setIsSubmitting(true)
      setFormError(null)
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: verifiedPasswordReset.email,
          resetToken: verifiedPasswordReset.resetToken,
          password: newPassword,
        }),
      })
      const msg = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error(getFirstValidationError(msg?.error) || msg?.error || "Проверьте новый пароль")
        }
        throw new Error(msg?.error || "Не удалось обновить пароль")
      }

      setPassword("")
      returnToLogin()
      toast({
        title: "Пароль обновлен",
        description: "Теперь войдите с новым паролем",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить пароль"
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

  const handleResendReset = async () => {
    if (!pendingPasswordReset || resendCountdown > 0) return

    try {
      setIsResending(true)
      setFormError(null)
      const res = await fetch("/api/auth/password-reset/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: pendingPasswordReset.email,
        }),
      })
      const msg = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(msg?.error || "Не удалось отправить код повторно")
      }

      setPendingPasswordReset(msg.pendingPasswordReset)
      setVerifiedPasswordReset(null)
      setResetCode("")
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (view === "login") {
      await handleLogin()
      return
    }

    if (view === "requestReset") {
      await handleRequestReset()
      return
    }

    if (view === "verifyReset") {
      await handleVerifyResetCode()
      return
    }

    await handleConfirmReset()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="space-y-2">
          {view !== "login" && (
            <Button
              type="button"
              variant="ghost"
              className="-ml-2 h-auto p-2 text-muted-foreground"
              onClick={returnToLogin}
            >
              <ArrowLeft className="size-4" />
              Назад ко входу
            </Button>
          )}

          <h1 className="text-2xl font-bold">
            {view === "login" && "Вход"}
            {view === "requestReset" && "Восстановление пароля"}
            {view === "verifyReset" && "Введите код"}
            {view === "confirmReset" && "Новый пароль"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {view === "login" && "Введите email и пароль"}
            {view === "requestReset" && "Укажите email, и мы отправим 6-значный код"}
            {view === "verifyReset" && `Код отправлен на ${maskedEmail}`}
            {view === "confirmReset" && `Обновите пароль для ${maskedEmail}`}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {view === "login" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="link" className="h-auto px-0 text-sm" onClick={openPasswordRecovery}>
                  Забыли пароль?
                </Button>
              </div>
            </>
          )}

          {view === "requestReset" && (
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <p className="text-sm leading-6 text-muted-foreground">
                Мы отправим 6-значный код на этот адрес. Код понадобится, чтобы задать новый пароль.
              </p>
            </div>
          )}

          {view === "verifyReset" && pendingPasswordReset && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Проверьте почту</p>
                <p className="mt-1 leading-6">
                  Введите код из письма. Он действует еще{" "}
                  <span className="font-semibold text-foreground">{formatCountdown(codeExpiryCountdown)}</span>.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-code">Код подтверждения</Label>
                <InputOTP
                  id="reset-code"
                  maxLength={6}
                  value={resetCode}
                  onChange={setResetCode}
                  containerClassName="justify-start"
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  className="-ml-2 h-auto px-2 text-muted-foreground"
                  onClick={() => {
                    setView("requestReset")
                    setFormError(null)
                    setResetCode("")
                    setNewPassword("")
                    setPendingPasswordReset(null)
                    setVerifiedPasswordReset(null)
                  }}
                >
                  Изменить email
                </Button>

                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0"
                  disabled={resendCountdown > 0 || isResending}
                  onClick={handleResendReset}
                >
                  {isResending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Отправляю...
                    </>
                  ) : resendCountdown > 0 ? (
                    `Отправить повторно через ${formatCountdown(resendCountdown)}`
                  ) : (
                    "Отправить код еще раз"
                  )}
                </Button>
              </div>
            </div>
          )}

          {view === "confirmReset" && verifiedPasswordReset && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Задайте новый пароль</p>
                <p className="mt-1 leading-6">
                  Сессия восстановления активна еще{" "}
                  <span className="font-semibold text-foreground">{formatCountdown(resetSessionCountdown)}</span>.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">Новый пароль</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  aria-describedby="login-reset-password-requirements"
                  required
                />
              </div>

              <div id="login-reset-password-requirements" className="space-y-1.5">
                {newPasswordRequirements.map((requirement) => (
                  <div
                    key={requirement.id}
                    className={cn(
                      "flex items-center gap-2 text-sm transition-colors",
                      !hasStartedTypingNewPassword && "text-muted-foreground",
                      hasStartedTypingNewPassword && requirement.met && "text-emerald-700",
                      hasStartedTypingNewPassword && !requirement.met && "text-destructive",
                    )}
                  >
                    {requirement.met ? <Check className="size-4" /> : <X className="size-4" />}
                    <span>{requirement.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={
              isSubmitting ||
              (view === "login" && !isLoginValid) ||
              (view === "requestReset" && !isResetEmailValid) ||
              (view === "verifyReset" && !isResetCodeValid) ||
              (view === "confirmReset" && !isNewPasswordValid)
            }
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {view === "login" && "Войти"}
            {view === "requestReset" && "Отправить код"}
            {view === "verifyReset" && "Подтвердить код"}
            {view === "confirmReset" && "Сохранить новый пароль"}
          </Button>

          {formError && <p className="text-center text-sm text-destructive">{formError}</p>}
        </form>

        {view === "login" ? (
          <div className="text-center text-sm">
            <span className="text-muted-foreground">У Вас нет аккаунта? </span>
            <Link href="/register" className="text-primary hover:underline">
              Регистрация
            </Link>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            Вспомнили пароль?{" "}
            <button type="button" className="text-primary hover:underline" onClick={returnToLogin}>
              Вернуться ко входу
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
