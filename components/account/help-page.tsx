"use client"

import { useMemo, type ReactNode } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertCircle,
  BarChart3,
  Bell,
  Building2,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  DollarSign,
  HelpCircle,
  Settings,
  ShieldCheck,
  User,
  Users,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useTranslation } from "@/lib/i18n/context"

interface HelpPageProps {
  onBack: () => void
  userRole: "owner" | "manager" | "worker"
  hideHeader?: boolean
}

type FaqItem = {
  id: string
  title: string
  subtitle: string
  icon: LucideIcon
  iconClassName: string
  content: ReactNode
}

type Translate = ReturnType<typeof useTranslation>["t"]

const buildOwnerFaqItems = (t: Translate): FaqItem[] => [
  {
    id: "roles",
    title: t("help_owner_roles_title"),
    subtitle: t("help_owner_roles_subtitle"),
    icon: ShieldCheck,
    iconClassName: "bg-primary/10 text-primary",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          {t("help_owner_roles_p1_before")} <span className="font-medium text-foreground">{t("hub_settings")}</span>{" "}
          {t("help_owner_roles_p1_middle")}{" "}
          <span className="font-medium text-foreground">{t("position_rules_title")}</span>. {t("help_owner_roles_p1_after")}
        </p>
        <p className="text-xs text-muted-foreground">{t("help_owner_roles_p2")}</p>
      </div>
    ),
  },
  {
    id: "team-setup",
    title: t("help_owner_setup_title"),
    subtitle: t("help_owner_setup_subtitle"),
    icon: Users,
    iconClassName: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">{t("help_owner_setup_p1")}</p>
        <div className="space-y-2">
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">{t("help_owner_setup_step1")}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">{t("help_owner_setup_step2")}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">{t("help_owner_setup_step3")}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">{t("help_owner_setup_step4")}</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "create-shift",
    title: t("help_owner_create_shift_title"),
    subtitle: t("help_owner_create_shift_subtitle"),
    icon: Calendar,
    iconClassName: "bg-primary/10 text-primary",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          {t("help_owner_create_shift_p1_before")} <span className="font-medium text-foreground">{t("owner_tab_shifts")}</span>,{" "}
          {t("help_owner_create_shift_p1_after")}
        </p>
        <p className="text-xs text-muted-foreground">{t("help_owner_create_shift_p2")}</p>
      </div>
    ),
  },
  {
    id: "cash",
    title: t("help_owner_cash_title"),
    subtitle: t("help_owner_cash_subtitle"),
    icon: DollarSign,
    iconClassName: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">{t("help_owner_cash_p1")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">{t("help_owner_cash_where_title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("help_owner_cash_where_desc")}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">{t("help_owner_cash_why_title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("help_owner_cash_why_desc")}</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "formulas",
    title: t("help_owner_formulas_title"),
    subtitle: t("help_owner_formulas_subtitle"),
    icon: Calculator,
    iconClassName: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">{t("help_owner_formulas_p1")}</p>
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3">
          <p className="text-xs font-medium text-sky-800 dark:text-sky-200">{t("help_recommendation")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("help_owner_formulas_tip")}</p>
        </div>
        <p className="text-xs text-muted-foreground">{t("help_owner_formulas_p2")}</p>
      </div>
    ),
  },
  {
    id: "reports-and-review",
    title: t("help_owner_reports_title"),
    subtitle: t("help_owner_reports_subtitle"),
    icon: BarChart3,
    iconClassName: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    content: (
      <div className="space-y-3">
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3">
          <p className="text-sm font-semibold">{t("help_owner_reports_section_title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("help_owner_reports_p1_before")} <span className="font-medium text-foreground">{t("reports_title")}</span>{" "}
            {t("help_owner_reports_p1_after")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline">{t("help_period_today")}</Badge>
            <Badge variant="outline">{t("help_period_date_range")}</Badge>
            <Badge variant="outline">{t("help_period_current_month")}</Badge>
          </div>
        </div>

        <Card className="border-border/70 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={1.7} />
            <p className="text-sm font-semibold">{t("help_owner_review_section_title")}</p>
          </div>
          <div className="mt-2 space-y-2">
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" strokeWidth={1.8} />
              <p className="text-xs text-muted-foreground">{t("help_owner_review_step1")}</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" strokeWidth={1.8} />
              <p className="text-xs text-muted-foreground">{t("help_owner_review_step2")}</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" strokeWidth={1.8} />
              <p className="text-xs text-muted-foreground">{t("help_owner_review_step3")}</p>
            </div>
          </div>
        </Card>
      </div>
    ),
  },
]

const buildWorkerFaqItems = (t: Translate): FaqItem[] => [
  {
    id: "my-shift",
    title: t("help_worker_shift_title"),
    subtitle: t("help_worker_shift_subtitle"),
    icon: Calendar,
    iconClassName: "bg-primary/10 text-primary",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          {t("help_worker_shift_p1_before")} <span className="font-medium text-foreground">{t("dash_next_shift")}</span>{" "}
          {t("help_worker_shift_p1_middle")} <span className="font-medium text-foreground">{t("owner_tab_shifts")}</span>{" "}
          {t("help_worker_shift_p1_after")}
        </p>
        <p className="text-xs text-muted-foreground">{t("help_worker_shift_p2")}</p>
      </div>
    ),
  },
  {
    id: "start-close",
    title: t("help_worker_start_title"),
    subtitle: t("help_worker_start_subtitle"),
    icon: CheckCircle2,
    iconClassName: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">{t("help_worker_start_p1")}</p>
        <div className="rounded-lg border border-border/70 bg-background/80 p-2">
          <p className="text-xs font-medium">{t("help_worker_start_unavailable_title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("help_worker_start_unavailable_desc")}</p>
        </div>
      </div>
    ),
  },
  {
    id: "money",
    title: t("help_worker_money_title"),
    subtitle: t("help_worker_money_subtitle"),
    icon: Wallet,
    iconClassName: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          {t("help_worker_money_p1_before")} <span className="font-medium text-foreground">{t("tab_money")}</span>.{" "}
          {t("help_worker_money_p1_after")}
        </p>
        <p className="text-xs text-muted-foreground">{t("help_worker_money_p2")}</p>
      </div>
    ),
  },
  {
    id: "venue",
    title: t("help_worker_venue_title"),
    subtitle: t("help_worker_venue_subtitle"),
    icon: Building2,
    iconClassName: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">{t("help_worker_venue_p1")}</p>
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3">
          <p className="text-xs font-medium text-sky-800 dark:text-sky-200">{t("help_worker_venue_code_title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("help_worker_venue_code_desc")}</p>
        </div>
      </div>
    ),
  },
  {
    id: "notifications",
    title: t("help_worker_notifications_title"),
    subtitle: t("help_worker_notifications_subtitle"),
    icon: Bell,
    iconClassName: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">{t("help_worker_notifications_p1")}</p>
        <p className="text-xs text-muted-foreground">{t("help_worker_notifications_p2")}</p>
      </div>
    ),
  },
  {
    id: "profile-settings",
    title: t("help_worker_profile_title"),
    subtitle: t("help_worker_profile_subtitle"),
    icon: User,
    iconClassName: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    content: (
      <div className="space-y-3">
        <Card className="border-border/70 p-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" strokeWidth={1.7} />
            <p className="text-sm font-semibold">{t("help_worker_profile_available_title")}</p>
          </div>
          <div className="mt-2 space-y-2">
            <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">{t("help_worker_profile_item1")}</div>
            <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">{t("help_worker_profile_item2")}</div>
            <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">{t("help_worker_profile_item3")}</div>
          </div>
        </Card>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-700 dark:text-rose-300" strokeWidth={1.7} />
            <p className="text-xs font-semibold">{t("help_important")}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("help_worker_profile_important")}</p>
        </div>
      </div>
    ),
  },
]

const buildRoleMeta = (t: Translate) => ({
  owner: {
    badge: t("help_role_owner_badge"),
    subtitle: t("help_role_owner_subtitle"),
  },
  manager: {
    badge: t("help_role_manager_badge"),
    subtitle: t("help_role_manager_subtitle"),
  },
  worker: {
    badge: t("help_role_worker_badge"),
    subtitle: t("help_role_worker_subtitle"),
  },
}) as const

export default function HelpPage({ onBack, userRole, hideHeader = false }: HelpPageProps) {
  const { t } = useTranslation()
  const faqItems = useMemo(() => (userRole === "worker" ? buildWorkerFaqItems(t) : buildOwnerFaqItems(t)), [t, userRole])
  const roleMeta = useMemo(() => buildRoleMeta(t)[userRole], [t, userRole])

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-6">
      {!hideHeader && (
        <div className="sticky top-0 z-10 bg-background">
          <div className="p-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-xl font-semibold">{t("help_title")}</h1>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pb-4 space-y-3">
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
          <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HelpCircle className="h-5 w-5" strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{t("help_center_title")}</h2>
                <Badge variant="outline" className="text-[10px]">
                  {roleMeta.badge}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{roleMeta.subtitle}</p>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="faq" className="gap-3">
          <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl bg-muted/70 p-1">
            <TabsTrigger value="faq" className="rounded-lg">
              FAQ
            </TabsTrigger>
            <TabsTrigger value="help" className="rounded-lg">
              {t("help_tab_help")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="faq" className="space-y-3">
            <Card className="overflow-hidden p-2">
              <Accordion type="single" collapsible className="w-full">
                {faqItems.map((item, index) => {
                  const Icon = item.icon
                  const isLast = index === faqItems.length - 1

                  return (
                    <AccordionItem
                      key={item.id}
                      value={item.id}
                      className={`${isLast ? "" : "border-b border-border/70"} px-2`}
                    >
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-start gap-3 text-left">
                          <div
                            className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${item.iconClassName}`}
                          >
                            <Icon className="h-4 w-4" strokeWidth={1.7} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight">{item.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>{item.content}</AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </Card>
          </TabsContent>

          <TabsContent value="help">
            <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-destructive/[0.05] p-6 text-center">
              <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-destructive/10 blur-2xl" />
              <div className="relative space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <HelpCircle className="h-5 w-5" strokeWidth={1.7} />
                </div>
                <p className="text-base font-semibold">{t("help_contact_unavailable")}</p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
