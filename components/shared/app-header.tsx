"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronDown, Bell } from "lucide-react"

interface AppHeaderProps {
  title: string
  onBack?: () => void
  titleAlign?: "center" | "left"
  showVenueSelector?: boolean
  selectedVenue?: string
  onVenueChange?: () => void
  onAvatarClick: () => void
  onNotificationClick?: () => void
  unreadCount?: number
  avatarUrl?: string
  userName?: string
}

export default function AppHeader({
  title,
  onBack,
  titleAlign = "center",
  showVenueSelector,
  selectedVenue,
  onVenueChange,
  onAvatarClick,
  onNotificationClick,
  unreadCount = 0,
  avatarUrl,
  userName,
}: AppHeaderProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          {titleAlign === "left" ? (
            <div className="flex items-center min-w-0 flex-1">
              {onBack ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onBack}
                  className="rounded-full h-9 w-9 flex-shrink-0 mr-2"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              ) : null}
              <h1 className="text-lg font-semibold truncate">{title}</h1>
            </div>
          ) : (
            <>
              {onBack ? (
                <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9 flex-shrink-0">
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              ) : (
                <div className="w-9" />
              )}
              <h1 className="text-lg font-semibold truncate px-2">{title}</h1>
            </>
          )}

          <div className="flex items-center gap-2">
            {onNotificationClick && (
              <button
                onClick={onNotificationClick}
                className="relative flex-shrink-0 rounded-full h-9 w-9 hover:bg-muted/50 transition-colors flex items-center justify-center"
              >
                <Bell className="h-5 w-5" strokeWidth={1.5} />
                {unreadCount > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive flex items-center justify-center">
                    <span className="text-[9px] text-white font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>
                  </div>
                )}
              </button>
            )}

            <button
              onClick={onAvatarClick}
              className="relative flex-shrink-0 rounded-full h-9 w-9 p-0.5 hover:opacity-80 transition-opacity"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl || "/placeholder.svg"}
                  alt={userName || "User"}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="h-full w-full rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-xs font-semibold">
                  {userName ? getInitials(userName) : "?"}
                </div>
              )}
            </button>
          </div>
        </div>

        {showVenueSelector && (
          <Button
            variant="outline"
            className="w-full justify-between h-9 bg-transparent text-sm"
            onClick={onVenueChange}
          >
            <span className="truncate">{selectedVenue === "all" ? "Все заведения" : (selectedVenue || "Выберите заведение")}</span>
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" strokeWidth={1.5} />
          </Button>
        )}
      </div>
    </div>
  )
}
