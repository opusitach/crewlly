"use client"

import type { ReactNode } from "react"
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

interface HelpPageProps {
  onBack: () => void
  userRole: "owner" | "worker"
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

const OWNER_FAQ_ITEMS: FaqItem[] = [
  {
    id: "roles",
    title: "Где настраиваются роли и права?",
    subtitle: "Как ограничить доступ к кассе, отчетам и команде.",
    icon: ShieldCheck,
    iconClassName: "bg-primary/10 text-primary",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Откройте <span className="font-medium text-foreground">Настройки</span> и перейдите в раздел{" "}
          <span className="font-medium text-foreground">Роли</span>. Там вы задаете, что сотрудник может видеть и
          делать в приложении.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">Смены</Badge>
          <Badge variant="secondary">Касса</Badge>
          <Badge variant="secondary">Отчеты</Badge>
          <Badge variant="secondary">Команда</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Практика: выдавайте минимально необходимые права. Это снижает ошибки и упрощает контроль.
        </p>
      </div>
    ),
  },
  {
    id: "team-setup",
    title: "Что нужно настроить перед созданием смен?",
    subtitle: "Команда, позиции и базовые настройки для планирования.",
    icon: Users,
    iconClassName: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Перед созданием смен убедитесь, что сотрудники добавлены в заведение, им назначены позиции, а роли/права
          позволяют выполнять нужные действия.
        </p>
        <div className="space-y-2">
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">1. Добавьте команду</p>
            <p className="mt-1 text-xs text-muted-foreground">Сотрудники должны быть привязаны к заведению</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">2. Назначьте позиции</p>
            <p className="mt-1 text-xs text-muted-foreground">Позиции используются в планировании и расчётах</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">3. Проверьте права</p>
            <p className="mt-1 text-xs text-muted-foreground">Кто создает/редактирует смены, кто проверяет кассу</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "create-shift",
    title: "Как создать смену?",
    subtitle: "Пошагово: дата, время, сотрудник и проверка пересечений.",
    icon: Calendar,
    iconClassName: "bg-primary/10 text-primary",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Перейдите в <span className="font-medium text-foreground">Смены</span>, начните создание смены, выберите
          дату и время, назначьте сотрудника (или позицию) и проверьте, что расписание не конфликтует с другими сменами.
        </p>
        <p className="text-xs text-muted-foreground">
          Если нужный сотрудник не отображается, обычно причина в том, что он не добавлен в текущее заведение или ему
          не назначена подходящая позиция.
        </p>
      </div>
    ),
  },
  {
    id: "cash",
    title: "Зачем нужен раздел «Касса»?",
    subtitle: "Фактические данные смены, контроль и основа для отчетов.",
    icon: DollarSign,
    iconClassName: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          В «Кассе» фиксируются значения по смене: выручка, наличные, безнал, возвраты, чаевые и другие поля, которые
          вы настроили. Эти данные используются для проверки и аналитики.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">Где настроить</p>
            <p className="mt-1 text-xs text-muted-foreground">Настройки → Касса</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-2">
            <p className="text-xs font-medium">Зачем</p>
            <p className="mt-1 text-xs text-muted-foreground">Проверка смен и отчеты по периоду</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "formulas",
    title: "Как работают расчёты и формулы?",
    subtitle: "Как из кассовых полей получаются итоговые показатели.",
    icon: Calculator,
    iconClassName: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Формулы считают итоговые значения на основе кассовых полей: например, базу для процента, контрольные суммы
          или служебные метрики. Сначала вводятся исходные данные, затем формулы пересчитывают результат.
        </p>
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3">
          <p className="text-xs font-medium text-sky-800 dark:text-sky-200">Рекомендация</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Сначала настройте поля кассы, затем формулы. После настройки проверьте результат на одной смене.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Если итог не совпадает с ожиданием, проверьте исходные поля и какие из них участвуют в базе/выручке.
        </p>
      </div>
    ),
  },
  {
    id: "reports-and-review",
    title: "Как пользоваться отчетами и проверкой кассы?",
    subtitle: "Периодовые итоги и workflow проверки смен владельцем/менеджером.",
    icon: BarChart3,
    iconClassName: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    content: (
      <div className="space-y-3">
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3">
          <p className="text-sm font-semibold">Отчеты</p>
          <p className="mt-1 text-xs text-muted-foreground">
            В разделе <span className="font-medium text-foreground">Отчеты</span> выбирайте период и смотрите сводку
            по кассовым полям и расчетным формулам за выбранные даты.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline">Сегодня</Badge>
            <Badge variant="outline">Период дат</Badge>
            <Badge variant="outline">Текущий месяц</Badge>
          </div>
        </div>

        <Card className="border-border/70 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={1.7} />
            <p className="text-sm font-semibold">Проверка кассы (рекомендуемый порядок)</p>
          </div>
          <div className="mt-2 space-y-2">
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" strokeWidth={1.8} />
              <p className="text-xs text-muted-foreground">Откройте кассу и очередь проверок / смену на проверке</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" strokeWidth={1.8} />
              <p className="text-xs text-muted-foreground">Сверьте поля кассы, формулы и расхождения</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" strokeWidth={1.8} />
              <p className="text-xs text-muted-foreground">Подтвердите данные или верните на уточнение</p>
            </div>
          </div>
        </Card>
      </div>
    ),
  },
]

const WORKER_FAQ_ITEMS: FaqItem[] = [
  {
    id: "my-shift",
    title: "Где смотреть ближайшую смену и расписание?",
    subtitle: "Главный экран и вкладка с планированием смен.",
    icon: Calendar,
    iconClassName: "bg-primary/10 text-primary",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          На экране <span className="font-medium text-foreground">Моя смена</span> показывается ближайшая смена. Во
          вкладке <span className="font-medium text-foreground">Смены</span> (планировщик) удобно смотреть список смен.
        </p>
        <p className="text-xs text-muted-foreground">
          Если смена не отображается, сначала проверьте выбранное заведение в шапке приложения.
        </p>
      </div>
    ),
  },
  {
    id: "start-close",
    title: "Как начать и завершить смену?",
    subtitle: "Что делать, если кнопки недоступны или шаги не открываются.",
    icon: CheckCircle2,
    iconClassName: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Откройте свою смену и выполняйте шаги на экране: старт смены, работа по смене и завершение. Если в смене
          настроены обязательные поля/процедуры, их нужно заполнить перед закрытием.
        </p>
        <div className="rounded-lg border border-border/70 bg-background/80 p-2">
          <p className="text-xs font-medium">Почему кнопка недоступна</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Обычно причина в времени смены, выбранном заведении или ограничениях доступа по вашей роли.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "money",
    title: "Где смотреть зарплату, начисления и чаевые?",
    subtitle: "Вкладка «Деньги» и когда данные могут появляться с задержкой.",
    icon: Wallet,
    iconClassName: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Перейдите во вкладку <span className="font-medium text-foreground">Деньги</span>. Там отображается сводка по
          заработку и начислениям за период, включая чаевые (если они рассчитаны и доступны).
        </p>
        <p className="text-xs text-muted-foreground">
          Если суммы не появились сразу, это может зависеть от завершения смены и обработки/подтверждения данных.
        </p>
      </div>
    ),
  },
  {
    id: "venue",
    title: "Почему я не вижу нужное заведение или смены?",
    subtitle: "Проверьте выбранное заведение и доступ по приглашению.",
    icon: Building2,
    iconClassName: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          В приложении можно переключать заведения. Если выбрано другое заведение, вы увидите другой список смен или
          пустой экран.
        </p>
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3">
          <p className="text-xs font-medium text-sky-800 dark:text-sky-200">Подключение по коду</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Если вас еще не добавили, используйте код приглашения в окне выбора заведения (если его выдал менеджер).
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "notifications",
    title: "Как работают уведомления?",
    subtitle: "Где смотреть непрочитанные события по сменам и системе.",
    icon: Bell,
    iconClassName: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    content: (
      <div className="space-y-3 rounded-xl bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Нажмите на иконку уведомлений в шапке. Можно переключать фильтр между непрочитанными и всеми уведомлениями.
        </p>
        <p className="text-xs text-muted-foreground">
          Там появляются события по сменам и системные сообщения. Уведомления можно отмечать прочитанными.
        </p>
      </div>
    ),
  },
  {
    id: "profile-settings",
    title: "Что я могу менять сам в профиле и настройках?",
    subtitle: "Что доступно сотруднику, а что настраивает владелец/менеджер.",
    icon: User,
    iconClassName: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    content: (
      <div className="space-y-3">
        <Card className="border-border/70 p-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" strokeWidth={1.7} />
            <p className="text-sm font-semibold">Обычно доступно сотруднику</p>
          </div>
          <div className="mt-2 space-y-2">
            <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">Профиль и личные данные</div>
            <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">Язык и раздел помощи</div>
            <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
              Настройки уведомлений (если доступны в вашем режиме)
            </div>
          </div>
        </Card>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-700 dark:text-rose-300" strokeWidth={1.7} />
            <p className="text-xs font-semibold">Важно</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Роли, права, касса, формулы и отчеты обычно настраиваются владельцем или менеджером с нужным доступом.
          </p>
        </div>
      </div>
    ),
  },
]

const ROLE_META = {
  owner: {
    badge: "FAQ владельца",
    subtitle: "Команда, смены, касса, формулы, отчеты и проверка данных.",
  },
  worker: {
    badge: "FAQ сотрудника",
    subtitle: "Смены, деньги, уведомления и действия в личном кабинете.",
  },
} as const

export default function HelpPage({ onBack, userRole, hideHeader = false }: HelpPageProps) {
  const faqItems = userRole === "owner" ? OWNER_FAQ_ITEMS : WORKER_FAQ_ITEMS
  const roleMeta = ROLE_META[userRole]

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-6">
      {!hideHeader && (
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="p-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-lg font-semibold">Помощь</h1>
              <div className="w-9" />
            </div>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
          <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HelpCircle className="h-5 w-5" strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">Центр помощи</h2>
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
              Помощь
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
                <p className="text-base font-semibold">Тебе никто не поможет</p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
