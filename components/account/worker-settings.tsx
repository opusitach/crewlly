"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ChevronLeft, ChevronRight, Globe, HelpCircle, Shield, Key } from "lucide-react"
import { useTranslation } from "@/lib/i18n/context"

interface WorkerSettingsProps {
  onBack: () => void
  hideHeader?: boolean
  onNavigateLanguage?: () => void
}

export default function WorkerSettings({ onBack, hideHeader = false, onNavigateLanguage }: WorkerSettingsProps) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState({
    shiftReminders: true,
    tipsNotifications: true,
    scheduleChanges: true,
  })

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-6">
      {!hideHeader && (
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="p-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-lg font-semibold">{t("settings_title")}</h1>
              <div className="w-9" />
            </div>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("settings_notifications")}</h3>

          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="shiftReminders" className="text-sm font-medium cursor-pointer">
                {t("settings_shift_reminders")}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings_shift_reminders_desc")}</p>
            </div>
            <Switch
              id="shiftReminders"
              checked={settings.shiftReminders}
              onCheckedChange={(checked) => setSettings({ ...settings, shiftReminders: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="tipsNotifications" className="text-sm font-medium cursor-pointer">
                {t("settings_tips_notifications")}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings_tips_notifications_desc")}</p>
            </div>
            <Switch
              id="tipsNotifications"
              checked={settings.tipsNotifications}
              onCheckedChange={(checked) => setSettings({ ...settings, tipsNotifications: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="scheduleChanges" className="text-sm font-medium cursor-pointer">
                {t("settings_schedule_changes")}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings_schedule_changes_desc")}</p>
            </div>
            <Switch
              id="scheduleChanges"
              checked={settings.scheduleChanges}
              onCheckedChange={(checked) => setSettings({ ...settings, scheduleChanges: checked })}
            />
          </div>
        </Card>

        <Card className="p-3 space-y-2 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("settings_language")}</h3>

          <button
            onClick={onNavigateLanguage}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">{t("hub_language_desc")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>
        </Card>

        <Card className="p-3 space-y-2 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("settings_help_privacy")}</h3>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <HelpCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">{t("settings_faq")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">{t("settings_privacy")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Key className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">{t("settings_change_password")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>
        </Card>
      </div>
    </div>
  )
}
