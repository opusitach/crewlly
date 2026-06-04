"use client"

import { LanguageProvider } from "@/lib/i18n/context"
import type { ReactNode } from "react"

export function LanguageProviderWrapper({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>
}
