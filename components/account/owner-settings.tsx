"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ChevronLeft, ChevronRight, Building2, DollarSign, Users, Shield, Key } from "lucide-react"

interface OwnerSettingsProps {
  onBack: () => void
}

export default function OwnerSettings({ onBack }: OwnerSettingsProps) {
  const [settings, setSettings] = useState({
    requireReceipts: true,
    autoCalculateTips: true,
    notifyShiftStart: true,
    notifyDiscrepancy: true,
  })

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-6">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-lg font-semibold">Настройки</h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">Бизнес</h3>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">Заведение по умолчанию</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <DollarSign className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">Оплата и чаевые</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Users className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">Управление сотрудниками</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">Касса и чеки</h3>

          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="receipts" className="text-sm font-medium cursor-pointer">
                Обязательные чеки
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">Требовать чеки для всех смен</p>
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
                Авто-расчет чаевых
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">Рассчитывать автоматически по правилам</p>
            </div>
            <Switch
              id="autoTips"
              checked={settings.autoCalculateTips}
              onCheckedChange={(checked) => setSettings({ ...settings, autoCalculateTips: checked })}
            />
          </div>
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">Уведомления</h3>

          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="shiftStart" className="text-sm font-medium cursor-pointer">
                Начало смены
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">Когда сотрудник открывает смену</p>
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
                Расхождения в кассе
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">При обнаружении недостач</p>
            </div>
            <Switch
              id="discrepancy"
              checked={settings.notifyDiscrepancy}
              onCheckedChange={(checked) => setSettings({ ...settings, notifyDiscrepancy: checked })}
            />
          </div>
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">Безопасность</h3>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Key className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">Сменить пароль</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>

          <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-sm font-medium truncate">Доступы и роли</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
          </button>
        </Card>
      </div>
    </div>
  )
}
