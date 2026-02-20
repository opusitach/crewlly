"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ImagePreview } from "@/components/ui/image-preview"
import {
  AlertCircle,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Loader2,
} from "lucide-react"
import {
  evaluateCashFormulaExpression,
  extractCashFormulaKeys,
  validateAndCompileCashFormulaSet,
} from "@/lib/cash/formula"

type CashSessionFieldValue = {
  id: string
  fieldKeySnapshot: string
  fieldLabelSnapshot: string
  inputStage: string
  isRequiredSnapshot: boolean
  valueCents: number
  isRevenueBasisSnapshot: boolean
}

type ReceiptUpload = {
  id: string
  photoUrl: string
  receiptType: "z_report" | "x_report" | "terminal" | "other" | string
  totalAmountCents: number | null
  takenAt: string | null
  createdAt: string
}

type CashFieldPhoto = {
  id: string
  answerId: string
  sourceWorkIntervalId: string
  fieldKey: string
  inputStage: "open" | "close" | string
  photoS3Key: string | null
  photoUrl: string | null
}

export type CashSessionDetails = {
  id: string
  status: "open" | "closing_draft" | "closed" | "reviewed" | string
  openedAt: string | null
  closedAt: string | null
  reviewedAt: string | null
  notes: string | null
  openingCashCents: number
  closingCashCents: number
  cashRegister: {
    id: string
    name: string
    locationId: string
  }
  workday: {
    id: string
    workDate: string
    status: string
  }
  closedByEmployee: {
    id: string
    fullName: string | null
  } | null
  fieldValues: CashSessionFieldValue[]
  receiptUploads: ReceiptUpload[]
  cashFieldPhotos?: CashFieldPhoto[]
}

type CashFormulaRow = {
  id: string
  resultKey: string
  resultLabel: string
  expression: string
  isTipsSource: boolean
  displayOrder: number
}

type FormulaCalculation = {
  resultKey: string
  resultLabel: string
  value: number | null
  isTipsSource: boolean
  displayOrder: number
}

type Props = {
  session: CashSessionDetails
  onBack: () => void
  onMarkReviewed?: () => void | Promise<void>
  isMarkReviewedLoading?: boolean
}

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

const formatDate = (raw: string) => {
  if (dateOnlyPattern.test(raw)) {
    const [yearRaw, monthRaw, dayRaw] = raw.split("-")
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const day = Number(dayRaw)
    if (year && month && day) {
      return new Date(year, month - 1, day).toLocaleDateString("ru-RU")
    }
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleDateString("ru-RU")
}

const formatTime = (raw: string | null) => {
  if (!raw) return "-"
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return "-"
  const hh = parsed.getHours().toString().padStart(2, "0")
  const mm = parsed.getMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}

const formatInteger = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)
}

const sortFieldValues = (rows: CashSessionFieldValue[]) =>
  [...rows].sort((a, b) => {
    if (a.inputStage !== b.inputStage) return a.inputStage === "open" ? -1 : 1
    return a.fieldLabelSnapshot.localeCompare(b.fieldLabelSnapshot)
  })

const normalizeFormulaRows = (raw: unknown): CashFormulaRow[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const resultKey = typeof row.resultKey === "string" ? row.resultKey.trim() : ""
      const resultLabel = typeof row.resultLabel === "string" ? row.resultLabel.trim() : ""
      const expression = typeof row.expression === "string" ? row.expression.trim() : ""
      if (!resultKey || !resultLabel || !expression) return null

      return {
        id: typeof row.id === "string" ? row.id : `formula_${index}`,
        resultKey,
        resultLabel,
        expression,
        isTipsSource: row.isTipsSource === true,
        displayOrder: Number.isInteger(row.displayOrder) ? Number(row.displayOrder) : index,
      } satisfies CashFormulaRow
    })
    .filter((row): row is CashFormulaRow => row !== null)
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.resultKey.localeCompare(b.resultKey)
    })
}

const calculateFormulas = (
  formulas: CashFormulaRow[],
  fieldValues: CashSessionFieldValue[],
): { items: FormulaCalculation[]; error: string | null } => {
  if (formulas.length === 0) {
    return { items: [], error: null }
  }

  const allowedFieldKeys = new Set(fieldValues.map((value) => value.fieldKeySnapshot))
  const validation = validateAndCompileCashFormulaSet(
    formulas.map((formula) => ({
      resultKey: formula.resultKey,
      resultLabel: formula.resultLabel,
      expression: formula.expression,
      displayOrder: formula.displayOrder,
    })),
    allowedFieldKeys,
  )

  if (!validation.ok) {
    return {
      items: [],
      error: validation.error,
    }
  }

  const runtimeValues = Object.fromEntries(fieldValues.map((row) => [row.fieldKeySnapshot, row.valueCents])) as Record<
    string,
    number
  >
  const formulaMetaByKey = new Map(formulas.map((formula) => [formula.resultKey, formula]))
  const calculated: FormulaCalculation[] = []

  for (const formula of validation.orderedFormulas) {
    const meta = formulaMetaByKey.get(formula.resultKey)
    const expression = validation.compiledExpressionsByKey[formula.resultKey] ?? formula.expression
    const formulaKeys = new Set(extractCashFormulaKeys(expression))

    for (const key of formulaKeys) {
      if (!Object.prototype.hasOwnProperty.call(runtimeValues, key)) {
        runtimeValues[key] = 0
      }
    }

    const evaluation = evaluateCashFormulaExpression(expression, runtimeValues, formulaKeys)
    if (!evaluation.ok) {
      return {
        items: [],
        error: `Ошибка в формуле «${meta?.resultLabel ?? formula.resultLabel}»: ${evaluation.error}`,
      }
    }

    runtimeValues[formula.resultKey] = evaluation.value
    calculated.push({
      resultKey: formula.resultKey,
      resultLabel: meta?.resultLabel ?? formula.resultLabel ?? formula.resultKey,
      value: evaluation.value,
      isTipsSource: Boolean(meta?.isTipsSource),
      displayOrder: meta?.displayOrder ?? formula.displayOrder ?? 0,
    })
  }

  return {
    items: calculated.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.resultKey.localeCompare(b.resultKey)
    }),
    error: null,
  }
}

export default function CashSessionDetailsView({
  session,
  onBack,
  onMarkReviewed,
  isMarkReviewedLoading = false,
}: Props) {
  const [sessionData, setSessionData] = useState<CashSessionDetails>(session)
  const [formulas, setFormulas] = useState<CashFormulaRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formulaLoadError, setFormulaLoadError] = useState<string | null>(null)

  useEffect(() => {
    setSessionData(session)
  }, [session])

  useEffect(() => {
    let active = true

    const load = async () => {
      setIsLoading(true)
      setLoadError(null)
      setFormulaLoadError(null)

      try {
        const sessionRes = await fetch(`/api/cash/sessions/${session.id}`, {
          credentials: "include",
          cache: "no-store",
        })
        const sessionJson = (await sessionRes.json().catch(() => null)) as { data?: CashSessionDetails; error?: string } | null
        if (!sessionRes.ok || !sessionJson?.data) {
          throw new Error(sessionJson?.error || "Не удалось загрузить кассовую смену")
        }

        if (!active) return
        setSessionData(sessionJson.data)

        let loadedFormulas: CashFormulaRow[] = []
        try {
          const settingsRes = await fetch(`/api/cash/settings?locationId=${session.cashRegister.locationId}`, {
            credentials: "include",
            cache: "no-store",
          })
          if (settingsRes.ok) {
            const settingsJson = (await settingsRes.json().catch(() => null)) as
              | { data?: { formulas?: unknown }; error?: string }
              | null
            loadedFormulas = normalizeFormulaRows(settingsJson?.data?.formulas)
          } else {
            const settingsErrorJson = (await settingsRes.json().catch(() => null)) as { error?: string } | null
            if (active) {
              setFormulaLoadError(settingsErrorJson?.error || "Не удалось загрузить формулы кассы")
            }
          }
        } catch {
          if (active) {
            setFormulaLoadError("Не удалось загрузить формулы кассы")
          }
        }

        if (!active) return
        setFormulas(loadedFormulas)
      } catch (error) {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : "Не удалось загрузить кассовую смену")
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [session.cashRegister.locationId, session.id])

  const fieldValues = useMemo(() => sortFieldValues(sessionData.fieldValues ?? []), [sessionData.fieldValues])
  const openValues = useMemo(() => fieldValues.filter((field) => field.inputStage === "open"), [fieldValues])
  const closeValues = useMemo(() => fieldValues.filter((field) => field.inputStage === "close"), [fieldValues])

  const formulaCalculation = useMemo(
    () => calculateFormulas(formulas, fieldValues),
    [fieldValues, formulas],
  )
  const cashFieldPhotos = useMemo(() => sessionData.cashFieldPhotos ?? [], [sessionData.cashFieldPhotos])

  const cashStatusBadge =
    sessionData.status === "reviewed"
      ? {
          label: "Проверено",
          className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
          icon: CheckCircle2,
        }
      : {
          label: "Требует проверки",
          className: "bg-primary/10 text-primary border-primary/20",
          icon: AlertCircle,
        }

  return (
    <div className="min-h-screen bg-background pb-6 max-w-md mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h1 className="text-xl font-semibold">Кассовая смена</h1>
            <div className="w-10" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-base">{sessionData.cashRegister.name || "Касса"}</p>
              <p className="text-sm text-muted-foreground">{formatDate(sessionData.workday.workDate)}</p>
              <p className="text-sm text-muted-foreground">
                Закрыл(а): {sessionData.closedByEmployee?.fullName || "Не указано"}
              </p>
            </div>
            <Badge variant="secondary" className={cashStatusBadge.className}>
              <cashStatusBadge.icon className="h-3 w-3 mr-1" strokeWidth={1.5} />
              {cashStatusBadge.label}
            </Badge>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" strokeWidth={1.5} />
              <span>{formatDate(sessionData.workday.workDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" strokeWidth={1.5} />
              <span>
                Открыта: {formatTime(sessionData.openedAt)} • Закрыта: {formatTime(sessionData.closedAt)}
              </span>
            </div>
          </div>

        </Card>

        {isLoading && (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              Загрузка деталей кассовой смены...
            </div>
          </Card>
        )}

        {!isLoading && loadError && (
          <Card className="p-4 border-destructive/30 bg-destructive/5 text-sm text-destructive">{loadError}</Card>
        )}

        {!isLoading && !loadError && (
          <>
            <Card className="p-4 space-y-3">
              <h2 className="font-semibold">Открытие кассы</h2>
              {openValues.length === 0 ? (
                <p className="text-sm text-muted-foreground">Поля открытия не заполнены.</p>
              ) : (
                <div className="space-y-2">
                  {openValues.map((field) => (
                    <div key={field.id} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {field.fieldLabelSnapshot}
                            {field.isRequiredSnapshot && <span className="text-destructive"> *</span>}
                          </p>
                        </div>
                        <p className="text-sm font-semibold whitespace-nowrap">{formatInteger(field.valueCents)}</p>
                      </div>
                      {cashFieldPhotos
                        .filter((photo) => photo.inputStage === "open" && photo.fieldKey === field.fieldKeySnapshot)
                        .map((photo) =>
                          photo.photoUrl ? (
                            <div key={photo.id} className="mt-2">
                              <ImagePreview
                                src={photo.photoUrl}
                                alt={`Фото поля ${field.fieldLabelSnapshot}`}
                                triggerClassName="w-full rounded-md border border-border/60"
                                imageClassName="h-28 w-full rounded-md object-cover"
                              />
                            </div>
                          ) : (
                            <p key={photo.id} className="mt-2 text-xs text-muted-foreground">
                              Фото загружено (без preview URL).
                            </p>
                          ),
                        )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <h2 className="font-semibold">Закрытие кассы</h2>
              {closeValues.length === 0 ? (
                <p className="text-sm text-muted-foreground">Поля закрытия не заполнены.</p>
              ) : (
                <div className="space-y-2">
                  {closeValues.map((field) => (
                    <div key={field.id} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {field.fieldLabelSnapshot}
                            {field.isRequiredSnapshot && <span className="text-destructive"> *</span>}
                          </p>
                          {field.isRevenueBasisSnapshot && (
                            <div className="mt-1">
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">Выручка</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-semibold whitespace-nowrap">{formatInteger(field.valueCents)}</p>
                      </div>
                      {cashFieldPhotos
                        .filter((photo) => photo.inputStage === "close" && photo.fieldKey === field.fieldKeySnapshot)
                        .map((photo) =>
                          photo.photoUrl ? (
                            <div key={photo.id} className="mt-2">
                              <ImagePreview
                                src={photo.photoUrl}
                                alt={`Фото поля ${field.fieldLabelSnapshot}`}
                                triggerClassName="w-full rounded-md border border-border/60"
                                imageClassName="h-28 w-full rounded-md object-cover"
                              />
                            </div>
                          ) : (
                            <p key={photo.id} className="mt-2 text-xs text-muted-foreground">
                              Фото загружено (без preview URL).
                            </p>
                          ),
                        )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Расчеты по формулам</h2>
                <Badge variant="secondary" className="bg-muted/60">
                  <Calculator className="h-3 w-3 mr-1" strokeWidth={1.5} />
                  Formula
                </Badge>
              </div>

              {formulaLoadError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {formulaLoadError}
                </div>
              )}

              {!formulaLoadError && formulaCalculation.error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {formulaCalculation.error}
                </div>
              )}

              {!formulaLoadError && !formulaCalculation.error && formulas.length === 0 && (
                <p className="text-sm text-muted-foreground">Формулы кассы не настроены.</p>
              )}

              {!formulaLoadError && !formulaCalculation.error && formulaCalculation.items.length > 0 && (
                <div className="space-y-2">
                  {formulaCalculation.items.map((item) => (
                    <div key={item.resultKey} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {item.resultLabel}
                            {item.isTipsSource && (
                              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                                Чаевые
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="font-semibold whitespace-nowrap">{formatInteger(item.value)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Button
              type="button"
              className="w-full h-11"
              disabled={sessionData.status === "reviewed" || !onMarkReviewed || isMarkReviewedLoading}
              onClick={() => {
                if (!onMarkReviewed) return
                void onMarkReviewed()
              }}
            >
              {sessionData.status === "reviewed" ? "Проверено" : isMarkReviewedLoading ? "Проверяем..." : "Проверено"}
            </Button>

          </>
        )}
      </div>
    </div>
  )
}
