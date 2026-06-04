"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChevronLeft, Check } from "lucide-react"
import { useTranslation } from "@/lib/i18n/context"
import type { Language } from "@/lib/i18n/translations"

interface LanguagePageProps {
  onBack: () => void
}

const LANGUAGES: { value: Language; label: string; nativeLabel: string; flag: string }[] = [
  { value: "ru", label: "Русский", nativeLabel: "Русский", flag: "🇷🇺" },
  { value: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
]

export default function LanguagePage({ onBack }: LanguagePageProps) {
  const { language, setLanguage, t } = useTranslation()

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-6">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-lg font-semibold">{t("lang_title")}</h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      <div className="p-3">
        <Card className="p-2 space-y-1 overflow-hidden">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.value}
              onClick={() => setLanguage(lang.value)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
            >
              <span className="text-2xl leading-none select-none">{lang.flag}</span>
              <span className="flex-1 text-sm font-medium">{lang.nativeLabel}</span>
              {language === lang.value && (
                <Check className="h-4 w-4 text-primary flex-shrink-0" strokeWidth={2} />
              )}
            </button>
          ))}
        </Card>
      </div>
    </div>
  )
}
