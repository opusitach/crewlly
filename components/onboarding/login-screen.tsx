"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Eye, EyeOff, Loader2, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"
import { getPasswordRequirementChecks, isStrongPassword, sanitizeAuthInput, sanitizePasswordInput } from "@/lib/validation/password"

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

function formatCountdown(totalSeconds: number, secondsSuffix: string) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes <= 0) {
    return `${seconds}${secondsSuffix}`
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
  const { t, language, setLanguage } = useTranslation()
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
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

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

  const secondsSuffix = t("auth_seconds_short")

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
          throw new Error(msg?.error || t("auth_wrong_credentials"))
        }
        throw new Error(msg?.error || t("auth_login_failed"))
      }

      toast({ title: t("auth_login_success") })
      await router.replace(redirectTo)
      router.refresh()
      if (redirectTo) window.location.href = redirectTo
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth_login_failed")
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
          throw new Error(getFirstValidationError(msg?.error) || t("auth_invalid_email_reset"))
        }
        throw new Error(msg?.error || t("auth_send_reset_failed"))
      }

      setPendingPasswordReset(msg.pendingPasswordReset)
      setVerifiedPasswordReset(null)
      setResetCode("")
      setNewPassword("")
      setView("verifyReset")
      setNow(Date.now())
      toast({
        title: t("auth_reset_code_sent"),
        description: t("auth_reset_code_sent_desc"),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth_send_reset_failed")
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
          throw new Error(getFirstValidationError(msg?.error) || msg?.error || t("auth_wrong_reset_code"))
        }
        throw new Error(msg?.error || t("auth_verify_code_failed"))
      }

      setVerifiedPasswordReset(msg.passwordReset)
      setNewPassword("")
      setView("confirmReset")
      setNow(Date.now())
      toast({ title: t("auth_code_confirmed"), description: t("auth_code_confirmed_desc") })
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth_verify_code_failed")
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
          throw new Error(getFirstValidationError(msg?.error) || msg?.error || t("auth_invalid_new_password"))
        }
        throw new Error(msg?.error || t("auth_update_password_failed"))
      }

      setPassword("")
      returnToLogin()
      toast({
        title: t("auth_password_updated"),
        description: t("auth_password_updated_desc"),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth_update_password_failed")
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
        throw new Error(msg?.error || t("auth_resend_failed"))
      }

      setPendingPasswordReset(msg.pendingPasswordReset)
      setVerifiedPasswordReset(null)
      setResetCode("")
      setNow(Date.now())
      toast({ title: t("auth_code_resent") })
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth_resend_failed")
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
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              {view !== "login" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="-ml-2 h-auto p-2 text-muted-foreground"
                  onClick={returnToLogin}
                >
                  <ArrowLeft className="size-4" />
                  {t("auth_back_to_login")}
                </Button>
              )}

              <h1 className="text-2xl font-bold">
                {view === "login" && t("auth_login_title")}
                {view === "requestReset" && t("auth_reset_title")}
                {view === "verifyReset" && t("auth_verify_code_title")}
                {view === "confirmReset" && t("auth_new_password_title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {view === "login" && t("auth_login_subtitle")}
                {view === "requestReset" && t("auth_reset_subtitle")}
                {view === "verifyReset" && t("auth_verify_subtitle", { email: maskedEmail })}
                {view === "confirmReset" && t("auth_new_password_subtitle", { email: maskedEmail })}
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
          {view === "login" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(sanitizeAuthInput(event.target.value))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth_password_label")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(sanitizePasswordInput(event.target.value))}
                    className="pr-10"
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
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="link" className="h-auto px-0 text-sm" onClick={openPasswordRecovery}>
                  {t("auth_forgot_password")}
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
                onChange={(event) => setEmail(sanitizeAuthInput(event.target.value))}
                required
              />
              <p className="text-sm leading-6 text-muted-foreground">
                {t("auth_reset_email_hint")}
              </p>
            </div>
          )}

          {view === "verifyReset" && pendingPasswordReset && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{t("auth_check_email")}</p>
                <p className="mt-1 leading-6">
                  {t("auth_code_expires_in", { time: formatCountdown(codeExpiryCountdown, secondsSuffix) })}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-code">{t("auth_code_label")}</Label>
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
                  {t("auth_change_email")}
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
                      {t("auth_resending")}
                    </>
                  ) : resendCountdown > 0 ? (
                    t("auth_resend_countdown", { time: formatCountdown(resendCountdown, secondsSuffix) })
                  ) : (
                    t("auth_resend_code")
                  )}
                </Button>
              </div>
            </div>
          )}

          {view === "confirmReset" && verifiedPasswordReset && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{t("auth_set_new_password_info")}</p>
                <p className="mt-1 leading-6">
                  {t("auth_session_expires_in", { time: formatCountdown(resetSessionCountdown, secondsSuffix) })}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">{t("auth_new_password_label")}</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(sanitizePasswordInput(event.target.value))}
                    aria-describedby="login-reset-password-requirements"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showNewPassword ? t("auth_hide_password") : t("auth_show_password")}
                  >
                    {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
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
                    <span>{t(`password_req_${requirement.id}` as Parameters<typeof t>[0])}</span>
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
            {view === "login" && t("auth_login_button")}
            {view === "requestReset" && t("auth_send_code_button")}
            {view === "verifyReset" && t("auth_verify_code_button")}
            {view === "confirmReset" && t("auth_save_password_button")}
          </Button>

          {formError && <p className="text-center text-sm text-destructive">{formError}</p>}
        </form>

        {view === "login" ? (
          <div className="text-center text-sm">
            <span className="text-muted-foreground">{t("auth_no_account")} </span>
            <Link href="/register" className="text-primary hover:underline">
              {t("auth_register_link")}
            </Link>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            {t("auth_remembered_password")}{" "}
            <button type="button" className="text-primary hover:underline" onClick={returnToLogin}>
              {t("auth_back_to_login_link")}
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
