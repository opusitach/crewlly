"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Calendar, DollarSign, Users, TrendingUp } from "lucide-react"

export default function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and headline */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-orange-600 shadow-lg">
            <Calendar className="h-10 w-10 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-balance">Crewlly</h1>
          <p className="text-lg text-muted-foreground text-balance leading-relaxed">
            Смены, зарплаты и чаевые — прозрачно и без хаоса
          </p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 space-y-2 bg-white/60 backdrop-blur-sm border-primary/10">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-sm">Управление сменами</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">Планируйте и отслеживайте</p>
          </Card>

          <Card className="p-4 space-y-2 bg-white/60 backdrop-blur-sm border-primary/10">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-sm">Прозрачные чаевые</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">Справедливое распределение</p>
          </Card>

          <Card className="p-4 space-y-2 bg-white/60 backdrop-blur-sm border-primary/10">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-sm">Контроль команды</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">Всё в одном месте</p>
          </Card>

          <Card className="p-4 space-y-2 bg-white/60 backdrop-blur-sm border-primary/10">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-sm">Отчёты и аналитика</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">Видьте полную картину</p>
          </Card>
        </div>

        {/* CTA */}
        <Button className="w-full h-14 text-lg" size="lg" onClick={onContinue}>
          Начать
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Настройка займёт 5–8 минут для владельцев
          <br />и 1–2 минуты для сотрудников
        </p>
      </div>
    </div>
  )
}
