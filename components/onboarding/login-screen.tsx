"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

export default function LoginScreen({ redirectTo = "/select-role" }: { redirectTo?: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const isValid = email.includes("@") && password.trim().length >= 1

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Вход</h1>
          <p className="text-sm text-muted-foreground">Введите email и пароль</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={!isValid || isSubmitting}>
            Войти
          </Button>

          {formError && <p className="text-sm text-destructive text-center">{formError}</p>}
        </form>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">У Вас нет аккаунта? </span>
          <Link href="/register" className="text-primary hover:underline">
            Регистрация
          </Link>
        </div>
      </Card>
    </div>
  )
}
