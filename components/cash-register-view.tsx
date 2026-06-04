"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChevronLeft, CheckCircle2, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ImageIcon } from "lucide-react"

export default function CashRegisterView({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold">Касса</h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Понедельник, 22 декабря</h3>
              <p className="text-sm text-muted-foreground">2 смены</p>
            </div>
            <Badge variant="destructive">
              <AlertCircle className="h-3 w-3 mr-1" strokeWidth={1.5} />
              Требует проверки
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Выручка (нал)</span>
              <span className="font-semibold">28 400 ₽</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Выручка (карта)</span>
              <span className="font-semibold">67 200 ₽</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between">
              <span className="font-semibold">Итого</span>
              <span className="font-bold text-lg">95 600 ₽</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
            <span>4 чека загружено</span>
          </div>

          <Button className="w-full h-11">Проверить день</Button>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Вторник, 23 декабря</h3>
              <p className="text-sm text-muted-foreground">2 смены</p>
            </div>
            <Badge variant="outline" className="border-primary text-primary">
              <CheckCircle2 className="h-3 w-3 mr-1" strokeWidth={1.5} />
              Идёт
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Выручка (нал)</span>
              <span className="font-semibold">15 200 ₽</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Выручка (карта)</span>
              <span className="font-semibold">34 100 ₽</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between">
              <span className="font-semibold">Итого</span>
              <span className="font-bold text-lg">49 300 ₽</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
            <span>2 чека загружено</span>
          </div>

          <Button variant="outline" className="w-full h-11 bg-transparent">
            Посмотреть детали
          </Button>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Среда, 21 декабря</h3>
              <p className="text-sm text-muted-foreground">2 смены</p>
            </div>
            <Badge variant="secondary">
              <CheckCircle2 className="h-3 w-3 mr-1" strokeWidth={1.5} />
              Подтверждено
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Выручка (нал)</span>
              <span className="font-semibold">32 800 ₽</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Выручка (карта)</span>
              <span className="font-semibold">71 400 ₽</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between">
              <span className="font-semibold">Итого</span>
              <span className="font-bold text-lg">104 200 ₽</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
            <span>5 чеков загружено</span>
          </div>
        </Card>
      </div>
    </div>
  )
}
