"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronDown, Bell } from "lucide-react"

interface AppHeaderProps {
  title: string
  titleHref?: string
  onBack?: () => void
  titleAlign?: "center" | "left"
  showVenueSelector?: boolean
  selectedVenue?: string
  onVenueChange?: () => void
  onAvatarClick: () => void
  onNotificationClick?: () => void
  unreadCount?: number | null
  avatarUrl?: string
  userName?: string
}

export default function AppHeader({
  title,
  titleHref,
  onBack,
  titleAlign = "center",
  showVenueSelector,
  selectedVenue,
  onVenueChange,
  onAvatarClick,
  onNotificationClick,
  unreadCount,
  avatarUrl,
  userName,
}: AppHeaderProps) {
  const hasUnreadBadge = typeof unreadCount === "number" && unreadCount > 0
  const unreadBadgeLabel = hasUnreadBadge ? (unreadCount > 9 ? "9+" : String(unreadCount)) : null

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)

  const titleNode = titleHref ? (
    <Link href={titleHref} className="hover:opacity-80 transition-opacity">
      {title}
    </Link>
  ) : (
    title
  )

  // 44pt icon button — matches HIG minimum tap target
  const iconBtnCls =
    "relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-fill-3 active:bg-fill-2 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"

  return (
    <div className="sticky top-0 z-10 glass-chrome">
      <div className="px-4 py-2 space-y-2">
        <div className="flex items-center justify-between gap-2 h-11">
          {/* Left slot */}
          {titleAlign === "left" ? (
            <div className="flex items-center min-w-0 flex-1 gap-1">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Назад"
                  className={iconBtnCls}
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2} />
                </button>
              )}
              <h1 className="text-headline truncate">{titleNode}</h1>
            </div>
          ) : (
            <>
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Назад"
                  className={iconBtnCls}
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2} />
                </button>
              ) : (
                <div className="w-11 flex-shrink-0" aria-hidden="true" />
              )}
              <h1 className="text-headline truncate px-1">{titleNode}</h1>
            </>
          )}

          {/* Right slot */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {onNotificationClick && (
              <button
                type="button"
                onClick={onNotificationClick}
                aria-label={
                  hasUnreadBadge
                    ? `Уведомления, ${unreadCount} непрочитанных`
                    : "Уведомления"
                }
                className={iconBtnCls}
              >
                <Bell className="h-5 w-5" strokeWidth={1.6} />
                {hasUnreadBadge && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[0.625rem] font-bold leading-none"
                  >
                    {unreadBadgeLabel}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onAvatarClick}
              aria-label={userName ? `Профиль: ${userName}` : "Профиль"}
              className={`${iconBtnCls} p-0.5`}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userName ?? "Аватар пользователя"}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="h-full w-full rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground text-xs font-semibold">
                  {userName ? getInitials(userName) : "?"}
                </div>
              )}
            </button>
          </div>
        </div>

        {showVenueSelector && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between bg-transparent"
            onClick={onVenueChange}
          >
            <span className="truncate">
              {selectedVenue === "all" ? "Все заведения" : (selectedVenue ?? "Выберите заведение")}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" strokeWidth={1.5} />
          </Button>
        )}
      </div>
    </div>
  )
}
