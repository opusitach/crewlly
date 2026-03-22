"use client"

import { Suspense, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"

const EXPIRED_COOKIE_DATE = "Thu, 01 Jan 1970 00:00:00 GMT"
const SESSION_COOKIE_NAME = "session_token"

function isSafeInternalTarget(value: string | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
}

function FigmaCaptureLaunchContent() {
  const searchParams = useSearchParams()
  const target = searchParams.get("target")
  const sessionToken = searchParams.get("session")
  const clearSession = searchParams.get("clear") === "1"

  const nextTarget = useMemo(() => {
    if (!isSafeInternalTarget(target)) return "/"
    return target
  }, [target])

  useEffect(() => {
    if (typeof window === "undefined") return

    if (clearSession) {
      document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=${EXPIRED_COOKIE_DATE}; SameSite=Lax`
    } else if (sessionToken) {
      document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; path=/; SameSite=Lax`
    }

    window.location.replace(`${nextTarget}${window.location.hash}`)
  }, [clearSession, nextTarget, sessionToken])

  return <LaunchPageShell />
}

function LaunchPageShell() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md space-y-3 text-center">
        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Figma Capture</p>
        <h1 className="text-2xl font-semibold">Подготавливаю экран к переносу</h1>
        <p className="text-sm leading-6 text-muted-foreground">Ставлю нужную сессию и перенаправляю на целевой маршрут.</p>
      </div>
    </main>
  )
}

export default function FigmaCaptureLaunchPage() {
  return (
    <Suspense fallback={<LaunchPageShell />}>
      <FigmaCaptureLaunchContent />
    </Suspense>
  )
}
