"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useAuthStore } from "@/lib/store/auth-store"
import { formatTimeValue } from "@/lib/utils/timezone"
import { ChevronLeft, Pause, Play, Camera, Upload, MessageSquarePlus, DollarSign } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface ShiftActiveScreenProps {
  onBack: () => void
  onCloseShift: () => void
  shiftData: any
}

export default function ShiftActiveScreen({ onBack, onCloseShift, shiftData }: ShiftActiveScreenProps) {
  const organizationTimeZone = useAuthStore((state) => state.organization?.timezone)
  const [isPaused, setIsPaused] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [receipts, setReceipts] = useState<File[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [cashData, setCashData] = useState({
    cashRevenue: "",
    cardRevenue: "",
    cashTips: "",
  })

  useEffect(() => {
    if (!isPaused) {
      const interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isPaused])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold">Смена идёт</h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Timer */}
        <Card className="p-6 space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">{isPaused ? "Смена на паузе" : "Вы на смене"}</p>
            <div className="text-5xl font-bold tracking-tight">{formatTime(elapsedTime)}</div>
            <p className="text-sm text-muted-foreground">
              Начало в{" "}
              {shiftData.startTime
                ? formatTimeValue(shiftData.startTime, organizationTimeZone, "14:00")
                : "14:00"}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant={isPaused ? "default" : "secondary"}
              className="flex-1 h-12"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? (
                <>
                  <Play className="h-5 w-5 mr-2" strokeWidth={1.5} />
                  Продолжить
                </>
              ) : (
                <>
                  <Pause className="h-5 w-5 mr-2" strokeWidth={1.5} />
                  Пауза
                </>
              )}
            </Button>
            <Button variant="destructive" className="flex-1 h-12" onClick={onCloseShift}>
              Закрыть смену
            </Button>
          </div>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-24 flex-col gap-2 bg-transparent">
                <MessageSquarePlus className="h-6 w-6" strokeWidth={1.5} />
                <span className="text-sm">Добавить заметку</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Добавить заметку</DialogTitle>
                <DialogDescription>Запишите важную информацию о смене</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea placeholder="Введите текст заметки" rows={4} />
                <Button className="w-full">Сохранить</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" className="h-24 flex-col gap-2 bg-transparent">
            <Camera className="h-6 w-6" strokeWidth={1.5} />
            <span className="text-sm">Загрузить чек</span>
          </Button>
        </div>

        {/* Money Section */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-semibold">Деньги</h3>
              <p className="text-sm text-muted-foreground">Вносите данные по ходу смены</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cashRevenue">Выручка наличными</Label>
              <Input
                id="cashRevenue"
                type="number"
                placeholder="0 ₽"
                value={cashData.cashRevenue}
                onChange={(e) => setCashData({ ...cashData, cashRevenue: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cardRevenue">Выручка картой</Label>
              <Input
                id="cardRevenue"
                type="number"
                placeholder="0 ₽"
                value={cashData.cardRevenue}
                onChange={(e) => setCashData({ ...cashData, cardRevenue: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cashTips">Чаевые наличными (необязательно)</Label>
              <Input
                id="cashTips"
                type="number"
                placeholder="0 ₽"
                value={cashData.cashTips}
                onChange={(e) => setCashData({ ...cashData, cashTips: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* Receipts */}
        <Card className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold">Загруженные чеки</h3>
            <p className="text-sm text-muted-foreground">Чеков загружено: {receipts.length}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 bg-transparent">
              <Camera className="h-5 w-5 mr-2" strokeWidth={1.5} />
              Камера
            </Button>
            <Button variant="outline" className="flex-1 bg-transparent">
              <Upload className="h-5 w-5 mr-2" strokeWidth={1.5} />
              Галерея
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
