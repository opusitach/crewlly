"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ChevronLeft, ChevronRight, Building2, DollarSign, Users, Shield, Key } from "lucide-react"
import { useTranslation } from "@/lib/i18n/context"

interface OwnerSettingsProps {
  onBack: () => void
}

export default function OwnerSettings({ onBack }: OwnerSettingsProps) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState({
    requireReceipts: true,
    autoCalculateTips: true,
    notifyShiftStart: true,
    notifyDiscrepancy: true,
  })

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-6">
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

      <div className="p-3 space-y-3">
        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("settings_business")}</h3>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">{t("settings_default_venue")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <DollarSign className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">{t("settings_payment_tips")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Users className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">{t("settings_manage_employees")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("settings_cash_receipts")}</h3>

          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="receipts" className="text-sm font-medium cursor-pointer">
                {t("settings_require_receipts")}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings_require_receipts_desc")}</p>
            </div>
            <Switch
              id="receipts"
              checked={settings.requireReceipts}
              onCheckedChange={(checked) => setSettings({ ...settings, requireReceipts: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="autoTips" className="text-sm font-medium cursor-pointer">
                {t("settings_auto_tips")}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings_auto_tips_desc")}</p>
            </div>
            <Switch
              id="autoTips"
              checked={settings.autoCalculateTips}
              onCheckedChange={(checked) => setSettings({ ...settings, autoCalculateTips: checked })}
            />
          </div>
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("settings_notifications")}</h3>

          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="shiftStart" className="text-sm font-medium cursor-pointer">
                {t("settings_notify_shift_start")}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings_notify_shift_start_desc")}</p>
            </div>
            <Switch
              id="shiftStart"
              checked={settings.notifyShiftStart}
              onCheckedChange={(checked) => setSettings({ ...settings, notifyShiftStart: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="discrepancy" className="text-sm font-medium cursor-pointer">
                {t("settings_notify_discrepancy")}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings_notify_discrepancy_desc")}</p>
            </div>
            <Switch
              id="discrepancy"
              checked={settings.notifyDiscrepancy}
              onCheckedChange={(checked) => setSettings({ ...settings, notifyDiscrepancy: checked })}
            />
          </div>
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("settings_security")}</h3>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Key className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">{t("settings_change_password")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">{t("settings_access_roles")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>
        </Card>
      </div>
    </div>
  )
}
