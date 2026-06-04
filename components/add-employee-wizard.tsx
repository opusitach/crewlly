"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { copyToClipboard } from "@/lib/utils/copy-to-clipboard"
import { ChevronLeft, Copy, Users } from "lucide-react"

type InviteCodeResponse = {
  data: {
    code: string | null
  } | null
  error?: string
}

export default function AddEmployeeWizard({
  onBack,
  onComplete,
  variant = "sheet",
}: {
  onBack: () => void
  onComplete?: () => void
  variant?: "page" | "sheet" | "modal"
}) {
  const { toast } = useToast()
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isPage = variant === "page"
  const isModal = variant === "modal"

  const loadInviteCode = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const res = await fetch("/api/invite-codes", { cache: "no-store" })
      const json = (await res.json().catch(() => null)) as InviteCodeResponse | null
      if (!res.ok) {
        throw new Error(json?.error || "Не удалось получить код")
      }
      const code = json?.data?.code ?? null
      if (!code) {
        throw new Error("Код приглашения не найден")
      }
      setInviteCode(code)
    } catch (error: any) {
      const message = error?.message ?? "Не удалось получить код"
      setErrorMessage(message)
      setInviteCode(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadInviteCode()
  }, [])

  const handleCopy = async () => {
    const codeToCopy = inviteCode?.trim()
    if (!codeToCopy) return
    const copied = await copyToClipboard(codeToCopy)
    if (copied) {
      toast({ title: "Код скопирован" })
    } else {
      toast({ title: "Не удалось скопировать", variant: "destructive" })
    }
  }

  if (isModal) {
    return (
      <div className="bg-background">
        <div className="border-b border-border px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Users className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">Код приглашения</h2>
                <p className="text-xs text-muted-foreground">Отправьте код сотруднику для подключения к команде</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                if (onComplete) {
                  onComplete()
                  return
                }
                onBack()
              }}
            >
              Готово
            </Button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm font-medium text-muted-foreground">Ваш код для приглашения сотрудников</p>

          <Card className="p-4">
            {isLoading && <p className="text-center text-sm text-muted-foreground">Загрузка кода...</p>}
            {!isLoading && errorMessage && <p className="text-center text-sm text-destructive">{errorMessage}</p>}
            {!isLoading && !errorMessage && inviteCode && (
              <p className="text-center text-3xl font-semibold tabular-nums tracking-[0.22em]">{inviteCode}</p>
            )}
          </Card>

          <div className="grid gap-2">
            <Button className="h-11 w-full" onClick={handleCopy} disabled={!inviteCode || isLoading}>
              <Copy className="mr-2 h-4 w-4" />
              Скопировать код
            </Button>
            {errorMessage && (
              <Button variant="outline" className="h-11 w-full" onClick={() => void loadInviteCode()} disabled={isLoading}>
                Повторить
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={isPage ? "min-h-screen bg-background pb-6 max-w-md mx-auto" : "bg-background"}>
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
            <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
          </Button>
          <h1 className="text-lg font-semibold">Код приглашения</h1>
          <Button variant="ghost" size="sm" onClick={() => onComplete?.()} className="text-xs">
            Готово
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Ваш код для приглашения сотрудников</h2>
        </div>

        <Card className="p-4">
          {isLoading && <p className="text-sm text-muted-foreground text-center">Загрузка кода...</p>}
          {!isLoading && errorMessage && <p className="text-sm text-destructive text-center">{errorMessage}</p>}
          {!isLoading && !errorMessage && inviteCode && (
            <p className="text-center text-3xl font-semibold tracking-[0.25em]">{inviteCode}</p>
          )}
        </Card>

        <Button className="w-full h-12" onClick={handleCopy} disabled={!inviteCode || isLoading}>
          <Copy className="h-4 w-4 mr-2" />
          Скопировать код
        </Button>
      </div>
    </div>
  )
}
