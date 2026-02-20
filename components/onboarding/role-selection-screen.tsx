"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Users, Briefcase } from "lucide-react"

export default function RoleSelectionScreen({
  onSelectOwner,
  onSelectWorker,
}: {
  onSelectOwner: () => void
  onSelectWorker: () => void
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Выберите роль</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Это определит ваш доступ и функции в приложении
          </p>
        </div>

        <div className="space-y-4">
          <Card
            className="p-6 space-y-4 hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50 active:scale-[0.98]"
            onClick={onSelectOwner}
          >
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center">
                <Briefcase className="h-8 w-8 text-white" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold">Владелец заведения</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                  Настройка команды, смен, кассы и отчётов
                </p>
              </div>
            </div>
            <Button className="w-full h-12 text-base" size="lg">
              Продолжить как владелец
            </Button>
          </Card>

          <Card
            className="p-6 space-y-4 hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50 active:scale-[0.98]"
            onClick={onSelectWorker}
          >
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
                <Users className="h-8 w-8 text-primary" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold">Сотрудник</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                  Мои смены, таймер, деньги и загрузка чеков
                </p>
              </div>
            </div>
            <Button className="w-full h-12 text-base" variant="secondary" size="lg">
              Продолжить как сотрудник
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
