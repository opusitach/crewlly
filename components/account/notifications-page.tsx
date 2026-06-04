"use client"

import { useEffect, useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { ru, enUS } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChevronLeft, CheckCircle2, AlertCircle, Clock, DollarSign, Check, Trash2 } from "lucide-react"
import {
  resolveNotificationNavigationTarget,
  type NotificationNavigationTarget,
} from "@/lib/notifications/navigation"
import { translateNotificationMessage, translateNotificationText } from "@/lib/notifications/display"
import { useTranslation } from "@/lib/i18n/context"

type NotificationType = "shift" | "cash" | "receipt" | "system"
type NotificationStatus = "read" | "unread"

type Notification = {
  id: string
  type: NotificationType
  title: string
  message: string
  payload?: unknown
  status: NotificationStatus
  createdAt: string
  readAt?: string | null
}

type NotificationsPageProps = {
  onBack: () => void
  hideHeader?: boolean
  onNotificationNavigate?: (target: NotificationNavigationTarget, notification: Notification) => void | Promise<void>
  onUnreadCountChange?: (count: number) => void
}

export default function NotificationsPage({
  onBack,
  hideHeader = false,
  onNotificationNavigate,
  onUnreadCountChange,
}: NotificationsPageProps) {
  const { t, language } = useTranslation()
  const dateLocale = language === "en" ? enUS : ru
  const [filter, setFilter] = useState<"all" | "unread">("unread")
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    const loadNotifications = async () => {
      setIsLoading(true)
      try {
        const res = await fetch("/api/notifications", { credentials: "include", cache: "no-store" })
        if (!res.ok) {
          setNotifications([])
          return
        }
        const json = await res.json()
        setNotifications(json?.data ?? [])
      } catch {
        setNotifications([])
      } finally {
        setIsLoading(false)
      }
    }

    void loadNotifications()
  }, [])

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case "shift":
        return Clock
      case "cash":
        return AlertCircle
      case "receipt":
        return CheckCircle2
      case "system":
        return DollarSign
    }
  }

  const getIconColor = (type: NotificationType) => {
    switch (type) {
      case "shift":
        return "text-primary"
      case "cash":
        return "text-destructive"
      case "receipt":
        return "text-primary"
      case "system":
        return "text-muted-foreground"
    }
  }

  const markAllAsRead = async () => {
    if (isUpdating) return
    setIsUpdating(true)
    try {
      const res = await fetch("/api/notifications", { method: "PATCH", credentials: "include" })
      if (!res.ok) return
      const nowIso = new Date().toISOString()
      setNotifications((current) =>
        current.map((n) => ({ ...n, status: "read", readAt: n.readAt ?? nowIso })),
      )
    } finally {
      setIsUpdating(false)
    }
  }

  const markAsRead = async (id: string) => {
    if (isUpdating) return
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "PATCH", credentials: "include" })
      if (!res.ok) return
      const json = (await res.json().catch(() => null)) as { data?: { readAt?: string | null } } | null
      const fallbackReadAt = new Date().toISOString()
      const serverReadAt = json?.data?.readAt ?? fallbackReadAt
      setNotifications((current) =>
        current.map((n) =>
          n.id === id ? { ...n, status: "read", readAt: n.readAt ?? serverReadAt } : n,
        ),
      )
    } finally {
      setIsUpdating(false)
    }
  }

  const deleteNotification = async (id: string) => {
    if (isUpdating) return
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" })
      if (!res.ok) return
      setNotifications((current) => current.filter((n) => n.id !== id))
    } finally {
      setIsUpdating(false)
    }
  }

  const filteredNotifications = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => n.status === "unread") : notifications),
    [filter, notifications],
  )

  const unreadCount = notifications.filter((n) => n.status === "unread").length

  useEffect(() => {
    if (isLoading) return
    onUnreadCountChange?.(unreadCount)
  }, [isLoading, onUnreadCountChange, unreadCount])

  const formatTimestamp = (value: string) =>
    formatDistanceToNow(new Date(value), { addSuffix: true, locale: dateLocale })

  const handleNotificationClick = async (notification: Notification) => {
    if (isUpdating || !onNotificationNavigate) return
    const target = resolveNotificationNavigationTarget(notification)
    if (!target) return

    if (notification.status === "unread") {
      await markAsRead(notification.id)
    }

    await onNotificationNavigate(target, notification)
  }

  return (
    <div className="min-h-screen bg-background pb-4 max-w-md mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-3 space-y-3">
          {!hideHeader && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-lg font-semibold">{t("notifications_title")}</h1>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2">
            <Button
              variant={filter === "unread" ? "default" : "outline"}
              className="flex-1 h-9 text-sm"
              onClick={() => setFilter("unread")}
            >
              {t("notifications_unread")}
              {unreadCount > 0 && <span className="ml-1.5 opacity-70">({unreadCount})</span>}
            </Button>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              className="flex-1 h-9 text-sm"
              onClick={() => setFilter("all")}
            >
              {t("notifications_all")}
            </Button>
          </div>

          {/* Mark all as read */}
          {unreadCount > 0 && (
            <Button variant="ghost" className="w-full h-8 text-xs text-primary" onClick={markAllAsRead}>
              <Check className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
              {t("notifications_mark_all_read")}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {filteredNotifications.length === 0 && !isLoading && (
          <Card className="p-8 text-center">
            <div className="h-12 w-12 rounded-full bg-muted mx-auto flex items-center justify-center mb-3">
              <CheckCircle2 className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="font-medium text-sm mb-1">
              {filter === "unread" ? t("notifications_empty_unread") : t("notifications_empty_all")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {filter === "unread" ? t("notifications_all_read") : t("notifications_hint")}
            </p>
          </Card>
        )}

        {isLoading && (
          <Card className="p-4 text-sm text-muted-foreground">{t("notifications_loading")}</Card>
        )}

        {!isLoading && filteredNotifications.map((notification) => {
          const Icon = getIcon(notification.type)
          const iconColor = getIconColor(notification.type)
          const navigationTarget = resolveNotificationNavigationTarget(notification)
          const isNavigable = Boolean(onNotificationNavigate && navigationTarget)

          return (
            <Card
              key={notification.id}
              className={`p-4 overflow-hidden ${isNavigable ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
              role={isNavigable ? "button" : undefined}
              tabIndex={isNavigable ? 0 : undefined}
              onClick={isNavigable ? () => void handleNotificationClick(notification) : undefined}
              onKeyDown={
                isNavigable
                  ? (event) => {
                      if (event.key !== "Enter" && event.key !== " ") return
                      event.preventDefault()
                      void handleNotificationClick(notification)
                    }
                  : undefined
              }
            >
              <div className="space-y-3">
                {/* Main content */}
                <div className="flex items-start gap-3">
                  <div
                    className={`h-8 w-8 rounded-full ${notification.status === "unread" ? "bg-primary/10" : "bg-muted"} flex items-center justify-center flex-shrink-0`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${iconColor}`} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3
                        className={`text-sm ${notification.status === "unread" ? "font-semibold" : "font-medium"} truncate`}
                      >
                        {translateNotificationText(notification.title, language)}
                      </h3>
                      {notification.status === "unread" && (
                        <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {translateNotificationMessage(notification.message, notification.title, language)}
                    </p>
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center justify-between pl-11">
                  <p className="text-[11px] text-muted-foreground">{formatTimestamp(notification.createdAt)}</p>
                  <div className="flex items-center gap-1">
                    {notification.status === "unread" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20"
                        onClick={(event) => {
                          event.stopPropagation()
                          void markAsRead(notification.id)
                        }}
                      >
                        <Check className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full bg-destructive/10 hover:bg-destructive/20"
                      onClick={(event) => {
                        event.stopPropagation()
                        void deleteNotification(notification.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
