"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ChevronLeft, Camera, Upload, AlertCircle, CheckCircle2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ImagePreview } from "@/components/ui/image-preview"

interface ShiftStartScreenProps {
  onBack: () => void
  onStartShift: (data: any) => void
  startPhoto?: { file: File; type: "selfie" | "workplace" } | null
}

export default function ShiftStartScreen({ onBack, onStartShift, startPhoto }: ShiftStartScreenProps) {
  const [step, setStep] = useState<"checklist" | "cash">("checklist")
  const [checklist, setChecklist] = useState({
    onSite: false,
    ready: false,
    cashAccepted: false,
  })
  const [cashData, setCashData] = useState({
    startingCash: "",
    comment: "",
    photo: null as File | null,
  })
  const [errors, setErrors] = useState<string[]>([])
  const startPhotoPreviewUrl = useMemo(
    () => (startPhoto?.file ? URL.createObjectURL(startPhoto.file) : null),
    [startPhoto?.file],
  )

  useEffect(() => {
    return () => {
      if (startPhotoPreviewUrl) URL.revokeObjectURL(startPhotoPreviewUrl)
    }
  }, [startPhotoPreviewUrl])

  const handleChecklistContinue = () => {
    if (!checklist.onSite || !checklist.cashAccepted) {
      setErrors(["Необходимо отметить обязательные пункты"])
      return
    }
    setErrors([])
    setStep("cash")
  }

  const handleStartShift = () => {
    if (!cashData.startingCash) {
      setErrors(["Укажите остаток наличных в кассе"])
      return
    }
    setErrors([])
    onStartShift({
      checklist,
      cashData,
      startTime: new Date(),
    })
  }

  if (step === "cash") {
    return (
      <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setStep("checklist")} className="rounded-full">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-xl font-semibold">Принятие кассы</h1>
              <div className="w-10" />
            </div>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {startPhoto && (
            <Card className="p-3 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg overflow-hidden flex-shrink-0">
                  {startPhotoPreviewUrl && (
                    <ImagePreview
                      src={startPhotoPreviewUrl}
                      alt="Фото открытия"
                      triggerClassName="h-full w-full rounded-lg"
                      imageClassName="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Фото открытия добавлено</p>
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" strokeWidth={1.5} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {startPhoto.type === "selfie" ? "Селфи" : "Рабочее место"}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="startingCash">Остаток наличных в кассе на старт *</Label>
              <Input
                id="startingCash"
                type="number"
                placeholder="0"
                value={cashData.startingCash}
                onChange={(e) => setCashData({ ...cashData, startingCash: e.target.value })}
                className="h-12 text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Комментарий</Label>
              <Textarea
                id="comment"
                placeholder="Добавьте комментарий (необязательно)"
                value={cashData.comment}
                onChange={(e) => setCashData({ ...cashData, comment: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-3">
              <Label>Фото стартового отчета (необязательно)</Label>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-11 bg-transparent">
                  <Camera className="h-5 w-5 mr-2" strokeWidth={1.5} />
                  Камера
                </Button>
                <Button variant="outline" className="flex-1 h-11 bg-transparent">
                  <Upload className="h-5 w-5 mr-2" strokeWidth={1.5} />
                  Галерея
                </Button>
              </div>
            </div>
          </Card>

          {errors.length > 0 && (
            <Card className="p-4 bg-destructive/10 border-destructive/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="space-y-1">
                  {errors.map((error, index) => (
                    <p key={index} className="text-sm text-destructive">
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            </Card>
          )}

          <Button className="w-full h-12 text-base" size="lg" onClick={handleStartShift}>
            Подтвердить старт
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold">Подготовка к смене</h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <Card className="p-5 space-y-5">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="onSite"
                checked={checklist.onSite}
                onCheckedChange={(checked) => setChecklist({ ...checklist, onSite: checked as boolean })}
              />
              <div className="space-y-1">
                <Label htmlFor="onSite" className="text-base font-medium cursor-pointer">
                  Я на месте *
                </Label>
                <p className="text-sm text-muted-foreground">Подтвердите, что вы прибыли на рабочее место</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="ready"
                checked={checklist.ready}
                onCheckedChange={(checked) => setChecklist({ ...checklist, ready: checked as boolean })}
              />
              <div className="space-y-1">
                <Label htmlFor="ready" className="text-base font-medium cursor-pointer">
                  Форма / готовность
                </Label>
                <p className="text-sm text-muted-foreground">Внешний вид и готовность к работе</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="cashAccepted"
                checked={checklist.cashAccepted}
                onCheckedChange={(checked) => setChecklist({ ...checklist, cashAccepted: checked as boolean })}
              />
              <div className="space-y-1">
                <Label htmlFor="cashAccepted" className="text-base font-medium cursor-pointer">
                  Принял кассу *
                </Label>
                <p className="text-sm text-muted-foreground">Проверил наличие размена и исправность оборудования</p>
              </div>
            </div>
          </div>
        </Card>

        {errors.length > 0 && (
          <Card className="p-4 bg-destructive/10 border-destructive/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <div className="space-y-1">
                {errors.map((error, index) => (
                  <p key={index} className="text-sm text-destructive">
                    {error}
                  </p>
                ))}
              </div>
            </div>
          </Card>
        )}

        <Button className="w-full h-12 text-base" size="lg" onClick={handleChecklistContinue}>
          Начать
        </Button>
      </div>
    </div>
  )
}
