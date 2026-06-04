"use client"

import { CalendarDays, ChartColumn, House, Shield, type LucideIcon } from "lucide-react"
import { useTranslation } from "@/lib/i18n/context"
import type { TranslationKey } from "@/lib/i18n/translations"

export type OwnerBottomNavTab = "dashboard" | "shifts" | "cash" | "reports"
export type OwnerTab = OwnerBottomNavTab | "settings"

type OwnerBottomNavProps = {
  activeTab?: OwnerTab
  onTabChange?: (tab: OwnerBottomNavTab) => void
}

const OWNER_BOTTOM_NAV_TABS: { key: OwnerBottomNavTab; labelKey: TranslationKey; Icon: LucideIcon }[] = [
  { key: "dashboard", labelKey: "owner_tab_dashboard", Icon: House },
  { key: "shifts", labelKey: "owner_tab_shifts", Icon: CalendarDays },
  { key: "cash", labelKey: "owner_action_review", Icon: Shield },
  { key: "reports", labelKey: "tab_money", Icon: ChartColumn },
]

export default function OwnerBottomNav({ activeTab, onTabChange }: OwnerBottomNavProps) {
  const { t } = useTranslation()
  const activeIndex = OWNER_BOTTOM_NAV_TABS.findIndex(({ key }) => key === activeTab)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-3 pb-safe">
      <nav
        aria-label={t("owner_nav_aria")}
        className="pointer-events-auto rounded-full border border-white/20 dark:border-white/10 glass-card p-2 shadow-elev-3"
      >
        <div className="relative grid grid-cols-4 items-center gap-2">
          {/* Sliding active pill */}
          <div
            aria-hidden="true"
            className={[
              "pointer-events-none absolute inset-y-0 left-0 rounded-full bg-primary shadow-[0_8px_20px_var(--tw-shadow-color)] [--tw-shadow-color:oklch(from_var(--primary)_l_c_h_/_0.35)]",
              "transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              activeIndex === -1 ? "opacity-0" : "opacity-100",
            ].join(" ")}
            style={{
              width: "calc((100% - 1.5rem) / 4)",
              transform:
                activeIndex === -1
                  ? "translateX(0)"
                  : `translateX(calc(${activeIndex} * (100% + 0.5rem)))`,
            }}
          />

          {OWNER_BOTTOM_NAV_TABS.map(({ key, labelKey, Icon }) => {
            const isActive = activeTab === key
            const label = t(labelKey)
            return (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onTabChange?.(key)}
                className={[
                  "relative z-10 flex h-14 min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-full",
                  "transition-[color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground active:scale-[0.96]",
                ].join(" ")}
              >
                <Icon
                  className={[
                    "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    isActive ? "size-6 scale-100" : "size-6 scale-[0.93]",
                  ].join(" ")}
                  strokeWidth={isActive ? 2.1 : 1.8}
                />
                <span className="sr-only">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
