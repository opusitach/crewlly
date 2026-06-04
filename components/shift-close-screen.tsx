"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ChevronLeft, Camera, Upload, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ImagePreview } from "@/components/ui/image-preview"

interface ShiftCloseScreenProps {
  onBack: () => void
  onSubmit: (data: any) => void
  shiftData: any
  endPhoto?: { file: File; type: "selfie" | "workplace" } | null
}

export default function ShiftCloseScreen({ onBack, onSubmit, shiftData, endPhoto }: ShiftCloseScreenProps) {
  const [closeData, setCloseData] = useState({
    cashRevenue: "",
    cardRevenue: "",
    cashTips: "",
    endingCash: "",
    comment: "",
  })
  const [receipts, setReceipts] = useState<File[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [showNoReceiptsDialog, setShowNoReceiptsDialog] = useState(false)
  const [showDiscrepancyDialog, setShowDiscrepancyDialog] = useState(false)
  const [discrepancyComment, setDiscrepancyComment] = useState("")
  const endPhotoPreviewUrl = useMemo(
    () => (endPhoto?.file ? URL.createObjectURL(endPhoto.file) : null),
    [endPhoto?.file],
  )

  useEffect(() => {
    return () => {
      if (endPhotoPreviewUrl) URL.revokeObjectURL(endPhotoPreviewUrl)
    }
  }, [endPhotoPreviewUrl])

  const validateAndSubmit = () => {
    const newErrors: string[] = []

    if (!closeData.cashRevenue) newErrors.push("Укажите выручку наличными")
    if (!closeData.cardRevenue) newErrors.push("Укажите выручку картой")
    if (!closeData.endingCash) newErrors.push("Укажите остаток наличных на конец")

    if (newErrors.length > 0) {
      setErrors(newErrors)
      return
    }

    // Check for discrepancy
    const startingCash = Number.parseFloat(shiftData.cashData?.startingCash || 0)
    const cashRevenue = Number.parseFloat(closeData.cashRevenue)
    const endingCash = Number.parseFloat(closeData.endingCash)
    const expectedEnding = startingCash + cashRevenue

    if (Math.abs(expectedEnding - endingCash) > 500) {
      setShowDiscrepancyDialog(true)
      return
    }

    // Check for receipts
    if (receipts.length === 0) {
      setShowNoReceiptsDialog(true)
      return
    }

    submitShift()
  }

  const submitShift = () => {
    onSubmit({
      ...closeData,
      receipts,
      discrepancyComment,
      endTime: new Date(),
    })
  }

  return (
    <div className="min-h-screen bg-background pb-24 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold">Закрытие смены</h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {endPhoto && (
          <Card className="p-3 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg overflow-hidden flex-shrink-0">
                {endPhotoPreviewUrl && (
                  <ImagePreview
                    src={endPhotoPreviewUrl}
                    alt="Фото закрытия"
                    triggerClassName="h-full w-full rounded-lg"
                    imageClassName="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Фото закрытия добавлено</p>
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" strokeWidth={1.5} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {endPhoto.type === "selfie" ? "Селфи" : "Рабочее место"}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Money Section */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-lg">Итоги денег</h3>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cashRevenue">Выручка наличными *</Label>
              <Input
                id="cashRevenue"
                type="number"
                placeholder="0"
                value={closeData.cashRevenue}
                onChange={(e) => setCloseData({ ...closeData, cashRevenue: e.target.value })}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cardRevenue">Выручка картой *</Label>
              <Input
                id="cardRevenue"
                type="number"
                placeholder="0"
                value={closeData.cardRevenue}
                onChange={(e) => setCloseData({ ...closeData, cardRevenue: e.target.value })}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cashTips">Чаевые наличными</Label>
              <Input
                id="cashTips"
                type="number"
                placeholder="0"
                value={closeData.cashTips}
                onChange={(e) => setCloseData({ ...closeData, cashTips: e.target.value })}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endingCash">Остаток наличных на конец *</Label>
              <Input
                id="endingCash"
                type="number"
                placeholder="0"
                value={closeData.endingCash}
                onChange={(e) => setCloseData({ ...closeData, endingCash: e.target.value })}
                className="h-12"
              />
              <p className="text-xs text-muted-foreground">
                Начальный остаток: {shiftData.cashData?.startingCash || 0} ₽
              </p>
            </div>
          </div>
        </Card>

        {/* Receipts */}
        <Card className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-lg">Чеки</h3>
            <p className="text-sm text-muted-foreground">Загружено: {receipts.length} шт.</p>
          </div>

          {receipts.length === 0 && (
            <div className="p-4 bg-secondary/50 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-medium">Чеки не загружены</p>
                <p className="text-sm text-muted-foreground">Добавьте фотографии чеков для подтверждения выручки</p>
              </div>
            </div>
          )}

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

        {/* Comment */}
        <Card className="p-5 space-y-3">
          <Label htmlFor="comment">Комментарий к смене</Label>
          <Textarea
            id="comment"
            placeholder="Добавьте комментарий (необязательно)"
            value={closeData.comment}
            onChange={(e) => setCloseData({ ...closeData, comment: e.target.value })}
            rows={4}
          />
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

        <Button className="w-full h-12 text-base" size="lg" onClick={validateAndSubmit}>
          Отправить на проверку
        </Button>
      </div>

      {/* No Receipts Dialog */}
      <Dialog open={showNoReceiptsDialog} onOpenChange={setShowNoReceiptsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить без чеков?</DialogTitle>
            <DialogDescription>
              Вы не загрузили ни одного чека. Это может усложнить проверку смены менеджером.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={submitShift} variant="destructive" className="w-full">
              Отправить без чеков
            </Button>
            <Button onClick={() => setShowNoReceiptsDialog(false)} variant="outline" className="w-full">
              Добавить чеки
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discrepancy Dialog */}
      <Dialog open={showDiscrepancyDialog} onOpenChange={setShowDiscrepancyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" strokeWidth={1.5} />
              Обнаружено расхождение
            </DialogTitle>
            <DialogDescription>
              Остаток наличных не соответствует ожидаемому значению. Пожалуйста, укажите причину расхождения.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Опишите причину расхождения"
              value={discrepancyComment}
              onChange={(e) => setDiscrepancyComment(e.target.value)}
              rows={4}
            />
            <Button onClick={submitShift} className="w-full" disabled={!discrepancyComment}>
              Отправить с комментарием
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
