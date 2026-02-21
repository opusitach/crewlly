import type { ReactNode } from "react"
import AppHistoryGuard from "@/components/navigation/app-history-guard"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHistoryGuard />
      {children}
    </>
  )
}
