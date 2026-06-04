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
import { useTranslation } from "@/lib/i18n/context"

type TipsDistributionMethod = "equal" | "by_hours"
export type SettingsScreen = "home" | "cash" | "team" | "roles" | "tips"

function TipsDistributionSettingsView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
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
        throw new Error(json?.error || t("venue_settings_load_tips_error"))
      }
      const method = json?.data?.splitMethod
      setSelectedMethod(method === "by_hours" ? "by_hours" : "equal")
    } catch (error: any) {
      toast({
        title: t("common_error"),
        description: error?.message || t("venue_settings_load_tips_error"),
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
        throw new Error(json?.error || t("venue_settings_save_tips_error"))
      }

      toast({
        title: t("venue_settings_saved"),
        description:
          selectedMethod === "equal"
            ? t("venue_settings_tips_equal_saved")
            : t("venue_settings_tips_by_hours_saved"),
      })
    } catch (error: any) {
      toast({
        title: t("common_error"),
        description: error?.message || t("venue_settings_save_tips_error"),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-6 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-lg font-semibold">{t("venue_settings_tips_title")}</h1>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-3">
          <h3 className="font-semibold">{t("venue_settings_tips_method")}</h3>

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
                  <h4 className="font-semibold">{t("venue_settings_tips_equal_title")}</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("venue_settings_tips_equal_desc")}
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
                  <h4 className="font-semibold">{t("venue_settings_tips_by_hours_title")}</h4>
                  <Badge variant="secondary" className="text-[10px]">
                    by_hours
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("venue_settings_tips_by_hours_desc")}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Button className="w-full h-12" onClick={saveTipsSettings} disabled={loading || saving}>
          <Check className="h-4 w-4 mr-2" strokeWidth={1.5} />
          {saving ? t("venue_settings_saving") : t("venue_settings_save_settings")}
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
  const { t } = useTranslation()
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
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-lg font-semibold">{t("venue_settings_title")}</h1>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <ReceiptText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-semibold">{t("venue_settings_cash_title")}</p>
                <p className="text-sm text-muted-foreground">{t("venue_settings_cash_desc")}</p>
              </div>
            </div>
            <Button onClick={() => setSettingsScreen("cash")}>{t("venue_settings_open")}</Button>
          </div>
        </Card>

        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <UsersRound className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-semibold">{t("venue_settings_team_title")}</p>
                <p className="text-sm text-muted-foreground">{t("venue_settings_team_desc")}</p>
              </div>
            </div>
            <Button onClick={() => setSettingsScreen("team")}>{t("venue_settings_open")}</Button>
          </div>
        </Card>

        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-semibold">{t("venue_settings_roles_title")}</p>
                <p className="text-sm text-muted-foreground">{t("venue_settings_roles_desc")}</p>
              </div>
            </div>
            <Button onClick={() => setSettingsScreen("roles")}>{t("venue_settings_open")}</Button>
          </div>
        </Card>

        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-semibold">{t("venue_settings_tips_title")}</p>
                <p className="text-sm text-muted-foreground">{t("venue_settings_tips_desc")}</p>
              </div>
            </div>
            <Button onClick={() => setSettingsScreen("tips")}>{t("venue_settings_open")}</Button>
          </div>
        </Card>

      </div>
    </div>
  )
}
