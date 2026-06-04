"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { User, Settings, Globe, HelpCircle, ChevronRight, Crown, Briefcase, Check, ChevronDown } from "lucide-react"
import { ImagePreview } from "@/components/ui/image-preview"
import { useTranslation } from "@/lib/i18n/context"
import type { Language } from "@/lib/i18n/translations"

interface AccountHubProps {
  isOpen: boolean
  onClose: () => void
  userRole: "owner" | "manager" | "worker"
  userName: string
  avatarUrl?: string
  onNavigate: (screen: "profile" | "settings" | "language" | "help" | "team") => void
}

const LANGUAGES: { value: Language; label: string; flag: string }[] = [
  { value: "ru", label: "Русский", flag: "🇷🇺" },
  { value: "en", label: "English", flag: "🇬🇧" },
]

export default function AccountHub({
  isOpen,
  onClose,
  userRole,
  userName,
  avatarUrl,
  onNavigate,
}: AccountHubProps) {
  const { t, language, setLanguage } = useTranslation()
  const [langOpen, setLangOpen] = useState(false)

  if (!isOpen) return null

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

  const roleLabel =
    userRole === "owner" ? t("role_owner") :
    userRole === "manager" ? t("role_manager") :
    t("role_worker")

  const currentLang = LANGUAGES.find((l) => l.value === language)!

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 max-w-md mx-auto animate-in slide-in-from-bottom duration-300">
        <Card className="rounded-t-3xl rounded-b-none border-b-0 shadow-2xl overflow-hidden">
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted" />
          </div>

          <div className="p-4 space-y-4">
            {/* User info */}
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              {avatarUrl ? (
                <ImagePreview
                  src={avatarUrl || "/placeholder.svg"}
                  alt={userName}
                  triggerClassName="h-14 w-14 rounded-full flex-shrink-0"
                  imageClassName="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-lg font-semibold flex-shrink-0">
                  {getInitials(userName)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold truncate">{userName}</h2>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {userRole === "owner" ? (
                    <Crown className="h-3.5 w-3.5" strokeWidth={1.5} />
                  ) : (
                    <Briefcase className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                  <span>{roleLabel}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              {/* Profile */}
              <button
                onClick={() => onNavigate("profile")}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <User className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t("hub_profile")}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {userRole !== "worker" ? t("hub_profile_desc_owner") : t("hub_profile_desc_worker")}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
              </button>

              {/* Settings (non-worker) */}
              {userRole !== "worker" && (
                <button
                  onClick={() => onNavigate("settings")}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                >
                  <Settings className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t("hub_settings")}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{t("hub_settings_desc")}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                </button>
              )}

              {/* Language — inline picker */}
              <div className="rounded-xl overflow-hidden">
                <button
                  onClick={() => setLangOpen((v) => !v)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t("hub_language")}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {currentLang.flag} {currentLang.label}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`}
                    strokeWidth={1.5}
                  />
                </button>

                {langOpen && (
                  <div className="px-3 pb-2 space-y-0.5">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.value}
                        onClick={() => { setLanguage(lang.value); setLangOpen(false) }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                          language === lang.value
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <span className="text-lg leading-none select-none">{lang.flag}</span>
                        <span className="flex-1 text-sm font-medium">{lang.label}</span>
                        {language === lang.value && (
                          <Check className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Help */}
              <button
                onClick={() => onNavigate("help")}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <HelpCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t("hub_help")}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{t("hub_help_desc")}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
