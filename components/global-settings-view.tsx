"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, Check, Clock, ReceiptText, ShieldCheck, Sparkles, UsersRound } from "lucide-react"
import CashSettingsView, { type CashSettingsTab } from "@/components/cash-settings-view"
import EmployeesView from "@/components/employees-view"
import PositionRulesView from "@/components/position-rules-view"
import { useToast } from "@/hooks/use-toast"

type TipsDistributionMethod = "equal" | "by_hours"
export type SettingsScreen = "home" | "cash" | "team" | "roles" | "tips"

function TipsDistributionSettingsView({ onBack }: { onBack: () => void }) {
  const { toast } = useToast()
  const [selectedMethod, setSelectedMethod] = useState<TipsDistributionMethod>("equal")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadTipsSettings()
  }, [])

  const loadTipsSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/tips/settings", { credentials: "include" })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "Не удалось загрузить настройки чаевых")
      }
      const method = json?.data?.splitMethod
      setSelectedMethod(method === "by_hours" ? "by_hours" : "equal")
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось загрузить настройки чаевых",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const saveTipsSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/tips/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splitMethod: selectedMethod }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "Не удалось сохранить настройки чаевых")
      }

      toast({
        title: "Сохранено",
        description:
          selectedMethod === "equal"
            ? "Чаевые будут распределяться поровну между сотрудниками."
            : "Чаевые будут распределяться пропорционально отработанному времени.",
      })
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось сохранить настройки чаевых",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-6 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-lg font-semibold">Распределение чаевых</h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-3">
          <h3 className="font-semibold">Метод распределения</h3>

          <Card
            className={`p-4 cursor-pointer transition-all ${
              selectedMethod === "equal" ? "border-2 border-primary bg-primary/5" : "hover:border-primary/50"
            }`}
            onClick={() => setSelectedMethod("equal")}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <UsersRound className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  <h4 className="font-semibold">Поровну между всеми</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Сумма делится равными долями между участниками рабочего дня.
                </p>
              </div>
            </div>
          </Card>

          <Card
            className={`p-4 cursor-pointer transition-all ${
              selectedMethod === "by_hours" ? "border-2 border-primary bg-primary/5" : "hover:border-primary/50"
            }`}
            onClick={() => setSelectedMethod("by_hours")}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  <h4 className="font-semibold">Пропорционально времени</h4>
                  <Badge variant="secondary" className="text-[10px]">
                    by_hours
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Сумма делится пропорционально учтенным минутам сотрудников.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Button className="w-full h-12" onClick={saveTipsSettings} disabled={loading || saving}>
          <Check className="h-4 w-4 mr-2" strokeWidth={1.5} />
          {saving ? "Сохранение..." : "Сохранить настройки"}
        </Button>
      </div>
    </div>
  )
}

export default function GlobalSettingsView({
  onBack,
  initialScreen = "home",
  initialCashTab = "open",
  cashLocationId = null,
}: {
  onBack: () => void
  initialScreen?: SettingsScreen
  initialCashTab?: CashSettingsTab
  cashLocationId?: string | null
}) {
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>(initialScreen)

  useEffect(() => {
    setSettingsScreen(initialScreen)
  }, [initialScreen])

  if (settingsScreen === "cash") {
    return (
      <CashSettingsView
        onBack={() => setSettingsScreen("home")}
        initialTab={initialCashTab}
        locationId={cashLocationId}
      />
    )
  }

  if (settingsScreen === "team") {
    return <EmployeesView onBack={() => setSettingsScreen("home")} />
  }

  if (settingsScreen === "roles") {
    return <PositionRulesView onBack={() => setSettingsScreen("home")} />
  }

  if (settingsScreen === "tips") {
    return <TipsDistributionSettingsView onBack={() => setSettingsScreen("home")} />
  }

  return (
    <div className="min-h-screen bg-background pb-6 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-lg font-semibold">Настройки заведения</h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <ReceiptText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-semibold">Касса</p>
                <p className="text-sm text-muted-foreground">Поля открытия/закрытия, формулы расчета и источник.</p>
              </div>
            </div>
            <Button onClick={() => setSettingsScreen("cash")}>Открыть</Button>
          </div>
        </Card>

        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <UsersRound className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-semibold">Команда</p>
                <p className="text-sm text-muted-foreground">Список сотрудников, карточки и управление составом.</p>
              </div>
            </div>
            <Button onClick={() => setSettingsScreen("team")}>Открыть</Button>
          </div>
        </Card>

        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-semibold">Роли и правила</p>
                <p className="text-sm text-muted-foreground">Правила открытия/закрытия по должностям.</p>
              </div>
            </div>
            <Button onClick={() => setSettingsScreen("roles")}>Открыть</Button>
          </div>
        </Card>

        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-semibold">Распределение чаевых</p>
                <p className="text-sm text-muted-foreground">Глобальный метод деления чаевых по локации.</p>
              </div>
            </div>
            <Button onClick={() => setSettingsScreen("tips")}>Открыть</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
