"use client"

import { useState } from "react"
import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/ui/phone-input"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getPhoneValidationError } from "@/lib/validation/phone"
import { getPasswordRequirementChecks, isStrongPassword } from "@/lib/validation/password"
import { useRouter } from "next/navigation"
import Link from "next/link"

type FlattenedValidationError = {
  fieldErrors?: Record<string, string[] | undefined>
  formErrors?: string[]
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

export default function RegistrationScreen({ onRegistered, redirectTo = "/select-role" }: { onRegistered?: () => void; redirectTo?: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const phoneError = getPhoneValidationError(phone)
  const showPhoneError = Boolean(phoneError) && phoneTouched
  const passwordRequirements = getPasswordRequirementChecks(password)
  const hasStartedTypingPassword = password.length > 0
  const isPasswordValid = isStrongPassword(password)

  const isValid = name.trim().length >= 2 && email.includes("@") && isPasswordValid && !phoneError

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phoneError) {
      setPhoneTouched(true)
      return
    }
    if (!isValid) return
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
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        if (res.status === 409) {
          throw new Error("Email уже используется")
        }
        if (res.status === 400) {
          throw new Error(getFirstValidationError(msg?.error) || "Проверьте корректность данных")
        }
        throw new Error(msg?.error || "Не удалось создать аккаунт")
      }
      toast({ title: "Аккаунт создан", description: "Теперь выберите роль" })
      onRegistered?.()
      await router.replace(redirectTo)
      router.refresh()
      if (redirectTo) window.location.href = redirectTo
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось создать аккаунт"
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Регистрация</h1>
          <p className="text-sm text-muted-foreground">Создайте аккаунт по email</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
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

          <Button type="submit" className="w-full" disabled={!isValid || isSubmitting}>
            Далее
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
