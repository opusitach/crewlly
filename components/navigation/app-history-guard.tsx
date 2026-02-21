"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const APP_GUARD_KEY = "__crewllyAppBackGuard"

type GuardStateValue = "base" | "trap"

type HistoryState = Record<string, unknown> & {
  [APP_GUARD_KEY]?: GuardStateValue
}

const withGuardState = (value: GuardStateValue): HistoryState => {
  const currentState = (window.history.state ?? {}) as Record<string, unknown>
  return {
    ...currentState,
    [APP_GUARD_KEY]: value,
  }
}

export default function AppHistoryGuard() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname !== "/app") return

    const currentState = (window.history.state ?? {}) as HistoryState
    if (currentState[APP_GUARD_KEY] !== "trap") {
      // Build a two-entry guard for /app:
      // [base(/app), trap(/app current)].
      // When user presses Back on /app, they land on base and we immediately restore trap,
      // so they stay inside app instead of leaving to previous site/onboarding route.
      window.history.replaceState(withGuardState("base"), "", window.location.href)
      window.history.pushState(withGuardState("trap"), "", window.location.href)
    }

    const handlePopState = (event: PopStateEvent) => {
      if (window.location.pathname !== "/app") return
      const state = (event.state ?? {}) as HistoryState
      if (state[APP_GUARD_KEY] === "trap") return
      window.history.pushState(withGuardState("trap"), "", window.location.href)
    }

    window.addEventListener("popstate", handlePopState)
    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [pathname])

  return null
}
