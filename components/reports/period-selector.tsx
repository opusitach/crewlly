"use client"

import { Button } from "@/components/ui/button"
import { Calendar } from "lucide-react"
import { format } from "date-fns"
import { enUS, ru } from "date-fns/locale"
import { useTranslation } from "@/lib/i18n/context"

interface PeriodSelectorProps {
  startDate: Date
  endDate: Date
  onClick: () => void
}

export default function PeriodSelector({ startDate, endDate, onClick }: PeriodSelectorProps) {
  const { t, language } = useTranslation()
  const dateLocale = language === "en" ? enUS : ru
  const formatDate = (date: Date) => {
    return format(date, "dd.MM", { locale: dateLocale })
  }

  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="w-full h-11 justify-between bg-background/60 backdrop-blur-sm border-border/50 hover:bg-accent/50 transition-all"
    >
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" strokeWidth={1.5} />
        <span className="font-medium text-sm">
          {t("reports_period_button", { start: formatDate(startDate), end: formatDate(endDate) })}
        </span>
      </div>
    </Button>
  )
}
