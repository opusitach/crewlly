"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function RegistrationScreen({ onRegistered, redirectTo = "/select-role" }: { onRegistered?: () => void; redirectTo?: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const isValid = name.trim().length >= 2 && email.includes("@") && password.length >= 6

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
          throw new Error("Проверьте корректность данных")
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
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Номер телефона</Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <p className="text-xs text-muted-foreground">Минимум 6 символов</p>
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
