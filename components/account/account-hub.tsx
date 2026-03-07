"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { User, Settings, Globe, HelpCircle, ChevronRight, Crown, Briefcase } from "lucide-react"
import { ImagePreview } from "@/components/ui/image-preview"

interface AccountHubProps {
  isOpen: boolean
  onClose: () => void
  userRole: "owner" | "worker"
  userName: string
  avatarUrl?: string
  onNavigate: (screen: "profile" | "settings" | "language" | "help" | "team") => void
}

export default function AccountHub({
  isOpen,
  onClose,
  userRole,
  userName,
  avatarUrl,
  onNavigate,
}: AccountHubProps) {
  if (!isOpen) return null

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const roleLabel = userRole === "owner" ? "Владелец" : "Сотрудник"

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 max-w-md mx-auto animate-in slide-in-from-bottom duration-300">
        <Card className="rounded-t-3xl rounded-b-none border-b-0 shadow-2xl overflow-hidden">
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted" />
          </div>

          <div className="p-4 space-y-4">
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
              <button
                onClick={() => onNavigate("profile")}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <User className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">Профиль</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {userRole === "owner" ? "Личная информация" : "Личные данные и контакты"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
              </button>

              {userRole === "owner" && (
                <button
                  onClick={() => onNavigate("settings")}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                >
                  <Settings className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">Настройки</p>
                    <p className="text-[10px] text-muted-foreground truncate">Уведомления и правила</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                </button>
              )}

              <button
                onClick={() => onNavigate("language")}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">Язык</p>
                  <p className="text-[10px] text-muted-foreground truncate">Русский</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
              </button>

              <button
                onClick={() => onNavigate("help")}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <HelpCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">Помощь</p>
                  <p className="text-[10px] text-muted-foreground truncate">Поддержка и FAQ</p>
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
