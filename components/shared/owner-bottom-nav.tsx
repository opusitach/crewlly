"use client"

import { LayoutDashboard, Calendar, CreditCard, Wallet, Settings } from "lucide-react"

export type OwnerTab = "dashboard" | "shifts" | "cash" | "reports" | "settings"

type OwnerBottomNavProps = {
  activeTab?: OwnerTab
  onTabChange?: (tab: OwnerTab) => void
}

const OWNER_TABS: { key: OwnerTab; label: string; Icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Главная", Icon: LayoutDashboard },
  { key: "shifts", label: "Смены", Icon: Calendar },
  { key: "cash", label: "Проверка", Icon: CreditCard },
  { key: "reports", label: "Финансы", Icon: Wallet },
  { key: "settings", label: "Настройки", Icon: Settings },
]

export default function OwnerBottomNav({ activeTab, onTabChange }: OwnerBottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto">
      <div className="bg-card border-t border-border shadow-2xl rounded-t-2xl">
        <div className="flex items-center justify-around h-14 px-1 pb-safe">
          {OWNER_TABS.map(({ key, label, Icon }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => onTabChange?.(key)}
                className={`
                  flex flex-col items-center justify-center gap-0.5
                  min-w-[44px] min-h-[44px] flex-1 rounded-lg transition-all
                  ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground active:scale-95"
                  }
                `}
              >
                <Icon className="h-6 w-6" strokeWidth={1.5} />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
