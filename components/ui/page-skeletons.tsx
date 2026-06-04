import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function HeaderSkeleton({ withVenue = false }: { withVenue?: boolean }) {
  return (
    <div className="sticky top-0 z-10 flex-shrink-0 bg-background">
      <div className="space-y-2 px-4 py-2">
        <div className="flex h-11 items-center justify-between gap-2">
          <Skeleton className="h-11 w-11 rounded-full" />
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-1">
            <Skeleton className="h-11 w-11 rounded-full" />
            <Skeleton className="h-11 w-11 rounded-full" />
          </div>
        </div>
        {withVenue && <Skeleton className="h-9 w-full rounded-md" />}
      </div>
    </div>
  )
}

function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[1, 2, 3, 4].map((item) => (
        <Card key={item} className="min-h-[132px] space-y-5 p-4 shadow-elev-1">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
        </Card>
      ))}
    </div>
  )
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-separator">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 p-4">
          <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

function FormCardSkeleton() {
  return (
    <Card className="space-y-5 p-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
    </Card>
  )
}

export function AuthPageSkeleton() {
  return (
    <main className="min-h-[100dvh] bg-background px-4 py-8" role="status" aria-label="Загрузка страницы">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col justify-center gap-6">
        <div className="space-y-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
        <FormCardSkeleton />
      </div>
    </main>
  )
}

export function AppPageSkeleton() {
  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col bg-background" role="status" aria-label="Загрузка приложения">
      <HeaderSkeleton withVenue />
      <div className="flex-1 overflow-hidden px-3 py-3">
        <div className="space-y-4">
          <KpiGridSkeleton />
          <div className="grid grid-cols-2 gap-2.5">
            <Skeleton className="h-11 rounded-xl" />
            <Skeleton className="h-11 rounded-xl" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-24" />
            <ListSkeleton rows={3} />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <ListSkeleton rows={2} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ShiftsPageSkeleton() {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-background pb-24" role="status" aria-label="Загрузка смен">
      <HeaderSkeleton />
      <div className="space-y-4 p-3">
        <Card className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-14 rounded-xl" />
            ))}
          </div>
        </Card>
        <ListSkeleton rows={5} />
      </div>
    </div>
  )
}

export function ProcedurePageSkeleton() {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-background" role="status" aria-label="Загрузка процедуры">
      <HeaderSkeleton />
      <div className="space-y-4 p-4">
        <Card className="space-y-3 p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        </Card>
        <ListSkeleton rows={4} />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  )
}

export function SettingsPageSkeleton() {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-background" role="status" aria-label="Загрузка настроек">
      <HeaderSkeleton />
      <div className="space-y-4 p-4">
        <FormCardSkeleton />
        <ListSkeleton rows={3} />
      </div>
    </div>
  )
}

export function MoneySummarySkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Загрузка выплат">
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-3 w-40" />
        <Skeleton className="mx-auto h-9 w-44" />
        <Skeleton className="mx-auto h-3 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="rounded-xl border border-border bg-muted/30 p-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-5 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
        <div className="space-y-2">
          <Skeleton className="mx-auto h-6 w-10" />
          <Skeleton className="mx-auto h-3 w-12" />
        </div>
        <div className="space-y-2">
          <Skeleton className="mx-auto h-6 w-16" />
          <Skeleton className="mx-auto h-3 w-20" />
        </div>
      </div>
    </div>
  )
}

export function MoneyHistorySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Загрузка истории">
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index} className="p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 flex-shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        </Card>
      ))}
    </div>
  )
}
