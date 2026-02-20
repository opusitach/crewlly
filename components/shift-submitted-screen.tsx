"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CheckCircle2, Clock, AlertCircle } from "lucide-react"

interface ShiftSubmittedScreenProps {
  onBack: () => void
  isUploading?: boolean
  uploadError?: boolean
  onRetryUpload?: () => void
}

export default function ShiftSubmittedScreen({
  onBack,
  isUploading = false,
  uploadError = false,
  onRetryUpload,
}: ShiftSubmittedScreenProps) {
  if (isUploading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 pb-24 max-w-md mx-auto">
        <div className="w-full space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="h-10 w-10 text-primary animate-pulse" strokeWidth={1.5} />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Закрытие в ожидании</h1>
            <p className="text-muted-foreground">Отправляем данные смены на сервер...</p>
          </div>

          <Card className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Требуется интернет</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Смена будет автоматически отправлена при восстановлении соединения
                </p>
              </div>
            </div>
          </Card>

          <Button variant="outline" className="w-full h-12 bg-transparent" onClick={onBack}>
            Вернуться на главную
          </Button>
        </div>
      </div>
    )
  }

  if (uploadError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 pb-24 max-w-md mx-auto">
        <div className="w-full space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-10 w-10 text-destructive" strokeWidth={1.5} />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Ошибка отправки</h1>
            <p className="text-muted-foreground">Не удалось загрузить фото и данные смены</p>
          </div>

          <Card className="p-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              Проверьте подключение к интернету и повторите попытку. Все данные сохранены локально.
            </p>
          </Card>

          <div className="space-y-3">
            <Button className="w-full h-12" onClick={onRetryUpload}>
              Повторить отправку
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
    <div className="min-h-screen bg-background flex items-center justify-center p-6 pb-24 max-w-md mx-auto">
      <div className="w-full space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-primary" strokeWidth={1.5} />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Смена отправлена</h1>
          <p className="text-muted-foreground">Ваша смена успешно отправлена на проверку</p>
        </div>

        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center">
              <Clock className="h-6 w-6 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-semibold">На проверке</h3>
              <p className="text-sm text-muted-foreground">Ожидайте подтверждения от менеджера</p>
            </div>
          </div>

          <div className="pt-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Статус</span>
              <span className="font-medium text-primary">Требует проверки</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Время проверки</span>
              <span className="font-medium">Обычно до 24 часов</span>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            После подтверждения смены менеджером, начисления автоматически обновятся в разделе "Деньги"
          </p>
          <Button className="w-full h-12 text-base" size="lg" onClick={onBack}>
            Вернуться на главную
          </Button>
        </div>
      </div>
    </div>
  )
}
