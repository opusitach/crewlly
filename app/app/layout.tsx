import type { ReactNode } from "react"
import AppHistoryGuard from "@/components/navigation/app-history-guard"
import InternalModeBadge from "@/components/internal/internal-mode-badge"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHistoryGuard />
      <InternalModeBadge />
      {children}
    </>
  )
}
