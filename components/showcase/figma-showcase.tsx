import Link from "next/link"
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const heroStats = [
  { label: "active venues", value: "18", tone: "from-amber-200/80 to-orange-100/70" },
  { label: "today payroll", value: "$14.8k", tone: "from-emerald-200/80 to-white/80" },
  { label: "late shifts", value: "02", tone: "from-rose-200/80 to-white/70" },
]

const shiftTimeline = [
  { time: "08:00", title: "Prep crew online", detail: "5 team members checked in at Riverside" },
  { time: "11:30", title: "Lunch surge", detail: "Auto-boosted two bartenders for terrace zone" },
  { time: "16:00", title: "Cash review", detail: "Manager confirmed tills and closed one exception" },
]

const venuePulse = [
  { label: "Roster coverage", value: "94%", color: "bg-emerald-500" },
  { label: "Checklist completion", value: "87%", color: "bg-amber-500" },
  { label: "Team energy", value: "4.8/5", color: "bg-sky-500" },
]

const payrollSlices = [
  { label: "Kitchen", amount: "$4.6k", width: "w-[78%]" },
  { label: "Floor", amount: "$5.2k", width: "w-[92%]" },
  { label: "Bar", amount: "$2.9k", width: "w-[61%]" },
  { label: "Delivery", amount: "$2.1k", width: "w-[44%]" },
]

export default function FigmaShowcase() {
  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(135deg,#fff8ef_0%,#fffdf8_45%,#fdebd2_100%)] text-slate-900">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:72px_72px] opacity-40" />
        <div className="absolute -left-24 top-0 size-96 rounded-full bg-orange-300/30 blur-3xl" />
        <div className="absolute right-0 top-24 size-[28rem] rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 size-[32rem] rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/60 px-5 py-4 shadow-[0_20px_80px_rgba(148,163,184,0.16)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-base font-semibold text-white shadow-lg shadow-slate-900/20">
              C
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-500">Crewlly</p>
              <p className="text-base font-semibold text-slate-900">Figma Showcase</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="rounded-full border-0 bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-600">
              Visual prototype
            </Badge>
            <Badge variant="secondary" className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
              Ops-focused UI
            </Badge>
            <Button asChild className="rounded-full px-5">
              <Link href="/login">
                Открыть логин
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid flex-1 gap-8 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-8">
            <div className="space-y-5">
              <Badge className="rounded-full border-0 bg-slate-900 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
                Crewlly Control Room
              </Badge>
              <div className="max-w-3xl space-y-4">
                <h1 className="text-5xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-6xl xl:text-7xl">
                  Операционный интерфейс, который держит смену, команду и выручку в одном ритме.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  Отдельная visual scene для Crewlly: живая смена, мониторинг команды, payroll и контроль открытия
                  точки в одном насыщенном интерфейсе.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full px-6 shadow-lg shadow-amber-500/20">
                <Link href="/register">
                  Попробовать onboarding
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/80 bg-white/70 px-6 backdrop-blur"
              >
                <Link href="/login">Открыть логин</Link>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {heroStats.map((stat) => (
                <Card
                  key={stat.label}
                  className={`overflow-hidden border-white/80 bg-gradient-to-br ${stat.tone} py-0 shadow-[0_18px_50px_rgba(15,23,42,0.08)]`}
                >
                  <CardContent className="space-y-2 px-5 py-5">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">{stat.label}</p>
                    <p className="text-3xl font-semibold tracking-[-0.05em] text-slate-950">{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -right-4 -top-8 hidden h-40 w-40 rounded-full bg-white/60 blur-3xl lg:block" />
            <div className="absolute -bottom-10 left-10 hidden h-44 w-44 rounded-full bg-orange-200/40 blur-3xl lg:block" />
            <Card className="relative overflow-hidden rounded-[2rem] border-white/70 bg-[linear-gradient(160deg,rgba(15,23,42,0.96)_0%,rgba(30,41,59,0.92)_58%,rgba(51,65,85,0.88)_100%)] py-0 text-white shadow-[0_35px_120px_rgba(15,23,42,0.38)]">
              <CardContent className="space-y-6 px-6 py-6 sm:px-8 sm:py-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <Badge className="rounded-full border-0 bg-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white">
                      Live shift board
                    </Badge>
                    <h2 className="text-3xl font-semibold tracking-[-0.05em]">Riverside Morning Shift</h2>
                    <p className="max-w-md text-sm leading-6 text-slate-300">
                      Crew readiness, front-of-house load, cash sync and checklist health in one compact command panel.
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-right backdrop-blur">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Start in</p>
                    <p className="text-xl font-semibold">12 min</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
                  <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Roster</p>
                        <p className="mt-1 text-lg font-semibold">11 people on shift</p>
                      </div>
                      <Users className="size-5 text-amber-300" />
                    </div>
                    <div className="space-y-3">
                      {[
                        { name: "Mia Carter", role: "Lead barista", status: "Checked in", tone: "bg-emerald-400" },
                        { name: "Noah Diaz", role: "Runner", status: "On route", tone: "bg-amber-400" },
                        { name: "Zoe Patel", role: "Cash desk", status: "Ready", tone: "bg-sky-400" },
                      ].map((member) => (
                        <div key={member.name} className="flex items-center gap-3 rounded-2xl bg-white/6 px-3 py-3">
                          <div className={`size-2.5 rounded-full ${member.tone}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{member.name}</p>
                            <p className="truncate text-xs text-slate-400">{member.role}</p>
                          </div>
                          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-200">
                            {member.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Revenue pulse</p>
                        <p className="mt-1 text-lg font-semibold">$3,420 projected by 2 PM</p>
                      </div>
                      <Wallet className="size-5 text-emerald-300" />
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-2xl bg-white/6 p-4">
                        <div className="flex items-center justify-between text-sm text-slate-300">
                          <span>Bar queue load</span>
                          <span className="font-semibold text-white">72%</span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-white/10">
                          <div className="h-2 w-[72%] rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300" />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-white/6 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Checklist</p>
                          <p className="mt-2 text-2xl font-semibold">19 / 21</p>
                          <p className="mt-1 text-xs text-slate-400">Opening tasks confirmed</p>
                        </div>
                        <div className="rounded-2xl bg-white/6 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Cash sync</p>
                          <p className="mt-2 text-2xl font-semibold">Clean</p>
                          <p className="mt-1 text-xs text-slate-400">Last variance resolved 09:14</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-white/10 bg-white/8 px-4 py-3 text-sm text-slate-200 backdrop-blur">
                  <ShieldCheck className="size-4 text-emerald-300" />
                  <span>All critical procedures signed</span>
                  <span className="h-1 w-1 rounded-full bg-white/30" />
                  <Clock3 className="size-4 text-amber-300" />
                  <span>Next floor handoff in 27 min</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-5 pb-8 lg:grid-cols-[0.95fr_0.8fr_0.9fr]">
          <Card className="rounded-[1.75rem] border-white/80 bg-white/70 py-0 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardContent className="space-y-5 px-6 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.26em] text-slate-500">Ops timeline</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Shift moments</h3>
                </div>
                <CalendarDays className="size-5 text-slate-500" />
              </div>
              <div className="space-y-4">
                {shiftTimeline.map((item) => (
                  <div key={item.time} className="grid grid-cols-[72px_1fr] gap-4">
                    <div className="rounded-2xl bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white">
                      {item.time}
                    </div>
                    <div className="rounded-[1.25rem] border border-slate-200/70 bg-white/85 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,rgba(255,248,235,0.92)_100%)] py-0 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardContent className="space-y-5 px-6 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.26em] text-slate-500">Venue pulse</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Readiness radar</h3>
                </div>
                <Sparkles className="size-5 text-amber-500" />
              </div>

              <div className="mx-auto flex size-48 items-center justify-center rounded-full border-[18px] border-slate-900 bg-[radial-gradient(circle_at_center,#fffdf7_0%,#fff7e8_52%,#fde7c6_100%)] shadow-inner">
                <div className="flex size-28 items-center justify-center rounded-full bg-slate-900 text-center text-white shadow-xl shadow-slate-900/20">
                  <div>
                    <p className="text-3xl font-semibold">91%</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-300">stable</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {venuePulse.map((item) => (
                  <div key={item.label} className="rounded-2xl bg-white/85 px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className="font-semibold text-slate-950">{item.value}</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-200">
                      <div className={`h-2 rounded-full ${item.color} ${item.label === "Checklist completion" ? "w-[87%]" : item.label === "Team energy" ? "w-[96%]" : "w-[94%]"}`} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-white/80 bg-white/72 py-0 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardContent className="space-y-5 px-6 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.26em] text-slate-500">Payroll board</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Labor allocation</h3>
                </div>
                <Wallet className="size-5 text-emerald-600" />
              </div>

              <div className="space-y-4">
                {payrollSlices.map((slice) => (
                  <div key={slice.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{slice.label}</span>
                      <span className="font-semibold text-slate-950">{slice.amount}</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-200">
                      <div className={`h-3 rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#f59e0b_100%)] ${slice.width}`} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.5rem] bg-slate-900 p-5 text-white">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Forecast</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">$18.6k</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Labor cost sits at 23.4%. Two small schedule edits will bring it back into target.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
