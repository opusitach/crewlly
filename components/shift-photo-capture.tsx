"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChevronLeft, Camera, AlertCircle, Settings, Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ImagePreview } from "@/components/ui/image-preview"

interface ShiftPhotoCaptureProps {
  onBack: () => void
  onPhotoTaken: (photo: File, photoType: "selfie" | "workplace") => void
  type: "start" | "end"
}

export default function ShiftPhotoCapture({ onBack, onPhotoTaken, type }: ShiftPhotoCaptureProps) {
  const [photoType, setPhotoType] = useState<"selfie" | "workplace">("selfie")
  const [photo, setPhoto] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<"denied" | "unavailable" | null>(null)
  const [isBlurry, setIsBlurry] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleTakePhoto = () => {
    // Simulate camera capture
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhoto(reader.result as string)
        // Simulate blur detection (in real app, would use ML)
        const randomCheck = Math.random() > 0.8
        setIsBlurry(randomCheck)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleContinue = () => {
    if (photo && fileInputRef.current?.files?.[0]) {
      onPhotoTaken(fileInputRef.current.files[0], photoType)
    }
  }

  const handleRetake = () => {
    setPhoto(null)
    setIsBlurry(false)
  }

  const openSettings = () => {
    // In real app, would open system settings
    window.alert("Откройте Настройки → Crewlly → Разрешить доступ к камере")
  }

  // Camera permission denied
  if (cameraError === "denied") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 pb-24 max-w-md mx-auto">
        <div className="w-full space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-10 w-10 text-destructive" strokeWidth={1.5} />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Нужен доступ к камере</h1>
            <p className="text-muted-foreground leading-relaxed">
              Для подтверждения {type === "start" ? "начала" : "завершения"} смены необходимо сделать фото. Разрешите
              доступ к камере в настройках.
            </p>
          </div>

          <Card className="p-5 space-y-3 bg-secondary/50">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                <span className="text-lg">1</span>
              </div>
              <p className="text-sm">Откройте настройки устройства</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                <span className="text-lg">2</span>
              </div>
              <p className="text-sm">Найдите приложение Crewlly</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                <span className="text-lg">3</span>
              </div>
              <p className="text-sm">Разрешите доступ к камере</p>
            </div>
          </Card>

          <div className="space-y-3">
            <Button className="w-full h-12" onClick={openSettings}>
              <Settings className="h-5 w-5 mr-2" strokeWidth={1.5} />
              Открыть настройки
            </Button>
            <Button variant="outline" className="w-full h-12 bg-transparent" onClick={onBack}>
              Назад
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-lg font-semibold truncate">
              {type === "start" ? "Подтвердите начало смены" : "Подтвердите завершение смены"}
            </h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Info Card */}
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Camera className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Зачем нужно фото?</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {type === "start"
                  ? "Фото помогает зафиксировать начало смены и избежать недоразумений"
                  : "Фото подтверждает факт закрытия и помогает избежать спорных ситуаций"}
              </p>
            </div>
          </div>
        </Card>

        {/* Photo Type Selector */}
        {!photo && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Выберите тип фото</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={photoType === "selfie" ? "default" : "outline"}
                className="h-20 flex-col gap-2 bg-transparent"
                onClick={() => setPhotoType("selfie")}
              >
                <span className="text-2xl">🤳</span>
                <span className="text-sm">Селфи</span>
              </Button>
              <Button
                variant={photoType === "workplace" ? "default" : "outline"}
                className="h-20 flex-col gap-2 bg-transparent"
                onClick={() => setPhotoType("workplace")}
              >
                <span className="text-2xl">📸</span>
                <span className="text-sm">Рабочее место</span>
              </Button>
            </div>
          </div>
        )}

        {/* Photo Preview or Camera Button */}
        {photo ? (
          <Card className="overflow-hidden">
            <div className="relative">
              <ImagePreview
                src={photo}
                alt="Фото смены"
                triggerClassName="w-full"
                imageClassName="w-full aspect-[4/3] object-cover"
              />
              <Badge className="absolute top-3 right-3 bg-background/80 backdrop-blur">
                {photoType === "selfie" ? "Селфи" : "Рабочее место"}
              </Badge>
            </div>

            {isBlurry && (
              <div className="p-4 bg-secondary/50 flex items-start gap-3 border-t border-border">
                <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Фото не читается</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Возможно, фото размыто или слишком тёмное. Рекомендуем переснять для лучшего качества.
                  </p>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-8 text-center space-y-4">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Camera className="h-12 w-12 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-semibold">
                {photoType === "selfie" ? "Сделайте селфи" : "Сфотографируйте рабочее место"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {photoType === "selfie" ? "Убедитесь, что лицо хорошо видно" : "Сфотографируйте кассу или рабочую зону"}
              </p>
            </div>
          </Card>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Actions */}
        {photo ? (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12 bg-transparent" onClick={handleRetake}>
              <X className="h-5 w-5 mr-2" strokeWidth={1.5} />
              Переснять
            </Button>
            <Button className="flex-1 h-12" onClick={handleContinue}>
              <Check className="h-5 w-5 mr-2" strokeWidth={1.5} />
              Продолжить
            </Button>
          </div>
        ) : (
          <Button className="w-full h-12" onClick={handleTakePhoto}>
            <Camera className="h-5 w-5 mr-2" strokeWidth={1.5} />
            Сделать фото
          </Button>
        )}

        <p className="text-xs text-center text-muted-foreground">Фото сохраняется только в истории смены</p>
      </div>
    </div>
  )
}
