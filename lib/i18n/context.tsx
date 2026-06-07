"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { translations, type Language, type TranslationKey } from "./translations"

const STORAGE_KEY = "crewlly-lang"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "en"
  const queryLanguage = new URLSearchParams(window.location.search).get("lang")
  if (queryLanguage === "en" || queryLanguage === "ru") return queryLanguage
  const stored = window.localStorage?.getItem(STORAGE_KEY)
  if (stored === "en" || stored === "ru") return stored
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${STORAGE_KEY}=`))
    ?.split("=")[1]
  if (cookie === "en" || cookie === "ru") return cookie
  return "en"
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en")

  useEffect(() => {
    setLanguageState(getInitialLanguage())
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    window.localStorage?.setItem(STORAGE_KEY, lang)
    document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  }, [])

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const template =
        (translations[language] as Record<string, string>)[key] ?? (translations.ru as Record<string, string>)[key] ?? key
      if (!params) return template
      return Object.entries(params).reduce(
        (value, [paramKey, paramValue]) => value.split(`{${paramKey}}`).join(String(paramValue)),
        template,
      )
    },
    [language],
  )

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useTranslation must be used within LanguageProvider")
  return ctx
}
