"use client"

import { CalendarDays, ChartColumn, House, Shield, type LucideIcon } from "lucide-react"

export type OwnerBottomNavTab = "dashboard" | "shifts" | "cash" | "reports"
export type OwnerTab = OwnerBottomNavTab | "settings"

type OwnerBottomNavProps = {
  activeTab?: OwnerTab
  onTabChange?: (tab: OwnerBottomNavTab) => void
}

const OWNER_BOTTOM_NAV_TABS: { key: OwnerBottomNavTab; label: string; Icon: LucideIcon }[] = [
  { key: "dashboard", label: "Главная", Icon: House },
  { key: "shifts", label: "Смены", Icon: CalendarDays },
  { key: "cash", label: "Проверка", Icon: Shield },
  { key: "reports", label: "Финансы", Icon: ChartColumn },
]

export default function OwnerBottomNav({ activeTab, onTabChange }: OwnerBottomNavProps) {
  const activeIndex = OWNER_BOTTOM_NAV_TABS.findIndex(({ key }) => key === activeTab)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-3 pb-safe">
      <nav
        aria-label="Нижняя навигация владельца"
        className="pointer-events-auto rounded-full border border-white/15 bg-[rgba(255,255,255,0.50)] p-2 shadow-[0_18px_48px_rgba(15,23,42,0.28)] [backdrop-filter:blur(20px)]"
      >
        <div className="relative grid grid-cols-4 items-center gap-2">
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-0 rounded-full bg-[#FF914D] shadow-[0_10px_24px_rgba(255,145,77,0.38)] transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              activeIndex === -1 ? "opacity-0" : "opacity-100"
            }`}
            style={{
              width: "calc((100% - 1.5rem) / 4)",
              transform:
                activeIndex === -1
                  ? "translateX(0)"
                  : `translateX(calc(${activeIndex} * (100% + 0.5rem)))`,
            }}
          />
          {OWNER_BOTTOM_NAV_TABS.map(({ key, label, Icon }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                type="button"
                aria-label={label}
                onClick={() => onTabChange?.(key)}
                className={`
                  relative z-10 flex h-14 min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-[color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]
                  ${
                    isActive
                      ? "text-white"
                      : "text-[#887876] hover:bg-white/10 hover:text-[#9A8A88] active:scale-[0.98]"
                  }
                `}
              >
                <Icon className={`h-7 w-7 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${isActive ? "scale-100" : "scale-[0.96]"}`} strokeWidth={1.9} />
                <span className="sr-only">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
