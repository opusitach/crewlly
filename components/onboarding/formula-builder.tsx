"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, Check, Delete, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  evaluateFormula,
  extractReferencedFields,
  extractReferencedMetrics,
  type EvalResult,
  type FieldMetaIndex,
  type NumericSubtype,
} from "@/lib/utils/formula"

export type ChecklistFieldLite = {
  id: string
  label: string
  numericSubtype: NumericSubtype
  section?: "OPEN" | "CLOSE"
}

export type MetricLite = {
  id: string
  label: string
  numericSubtype: NumericSubtype
}

type FormulaBuilderProps = {
  availableFields: ChecklistFieldLite[]
  availableMetrics?: MetricLite[]
  fieldMeta: FieldMetaIndex
  expression: string
  onChange: (next: string) => void
  onEval?: (result: EvalResult) => void
  disabled?: boolean
  title?: string
  showRaw?: boolean
}

const OPERATOR_BUTTONS = [
  { label: "+", value: "+" },
  { label: "-", value: "-" },
  { label: "×", value: "*" },
  { label: "÷", value: "/" },
  { label: "(", value: "(" },
  { label: ")", value: ")" },
  { label: "%", value: "%" },
]

export function FormulaBuilder({
  availableFields,
  availableMetrics = [],
  expression,
  onChange,
  fieldMeta,
  onEval,
  disabled = false,
  title,
  showRaw = true,
}: FormulaBuilderProps) {
  const [displayExpression, setDisplayExpression] = useState(expression)

  const referencedFields = useMemo(() => extractReferencedFields(expression), [expression])
  const referencedMetrics = useMemo(() => extractReferencedMetrics(expression), [expression])
  const tokensForView = useMemo(() => {
    const tokens: Array<{ type: "field" | "metric" | "op" | "number" | "percent"; raw: string }> = []
    const source = displayExpression.trim()
    if (!source) return tokens
    const regex = /\{\{field:([^}]+)\}\}|\{\{metric:([^}]+)\}\}|[0-9]+|[+\-*/()]|%|[^\s]+/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(source))) {
      const [raw, fieldId, metricId] = match
      if (fieldId) tokens.push({ type: "field", raw: fieldId })
      else if (metricId) tokens.push({ type: "metric", raw: metricId })
      else if (/^[0-9]+$/.test(raw)) tokens.push({ type: "number", raw })
      else if (raw === "%") tokens.push({ type: "percent", raw })
      else tokens.push({ type: "op", raw })
    }
    return tokens
  }, [displayExpression])
  const [sampleValues, setSampleValues] = useState<Record<string, number>>({})
  const [result, setResult] = useState<EvalResult | null>(null)
  const onEvalRef = useRef<FormulaBuilderProps["onEval"]>(undefined)

  useEffect(() => {
    onEvalRef.current = onEval
  }, [onEval])

  const toDisplay = useMemo(() => {
    const fieldMap = Object.fromEntries(availableFields.map((f) => [f.id, f.label]))
    const metricMap = Object.fromEntries(availableMetrics.map((m) => [m.id, m.label]))
    return (canonical: string) =>
      canonical
        .replace(/\{\{field:([^}]+)\}\}/g, (_, id) => fieldMap[id] || id)
        .replace(/\{\{metric:([^}]+)\}\}/g, (_, id) => metricMap[id] || id)
  }, [availableFields, availableMetrics])

  const toCanonical = useMemo(() => {
    const pairs: Array<{ label: string; token: string }> = [
      ...availableFields.map((f) => ({ label: f.label, token: `{{field:${f.id}}}` })),
      ...availableMetrics.map((m) => ({ label: m.label, token: `{{metric:${m.id}}}` })),
    ].sort((a, b) => b.label.length - a.label.length) // длинные сначала, чтобы не перезаписать подстроки

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

    return (display: string) => {
      let value = display
      for (const { label, token } of pairs) {
        const re = new RegExp(`${escapeRegex(label)}`, "g")
        value = value.replace(re, token)
      }
      return value
    }
  }, [availableFields, availableMetrics])

  useEffect(() => {
    // синхронизация, если внешнее canonical изменилось
    const nextDisplay = toDisplay(expression)
    if (nextDisplay !== displayExpression) {
      setDisplayExpression(nextDisplay)
    }
  }, [expression, toDisplay, displayExpression])

  useEffect(() => {
    const next: Record<string, number> = {}
    referencedFields.forEach((id) => {
      next[id] = sampleValues[id] ?? 0
    })
    referencedMetrics.forEach((id) => {
      next[id] = sampleValues[id] ?? 0
    })
    setSampleValues(next)
  }, [expression])

  useEffect(() => {
    const evalResult = evaluateFormula(expression, sampleValues, {
      fieldMeta,
      metricMeta: Object.fromEntries(availableMetrics.map((m) => [m.id, { numericSubtype: m.numericSubtype }])),
    })
    setResult(evalResult)
    onEvalRef.current?.(evalResult)
  }, [expression, sampleValues, fieldMeta, availableMetrics])

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const appendToken = (token: string, displayLabel: string) => {
    if (disabled) return

    const target = textareaRef.current
    const expr = displayExpression || ""

    if (target) {
      const { selectionStart = expr.length, selectionEnd = expr.length } = target
      const before = expr.slice(0, selectionStart)
      const after = expr.slice(selectionEnd)

      const needsSpaceBefore = before.length > 0 && !before.endsWith(" ")
      const needsSpaceAfter = after.length > 0 && !after.startsWith(" ")
      const insertion = `${needsSpaceBefore ? " " : ""}${displayLabel}${needsSpaceAfter ? " " : ""}`

      const nextExpr = `${before}${insertion}${after}`
      const caretPos = (before + insertion).length

      const canonical = toCanonical(nextExpr)

      setDisplayExpression(nextExpr)
      onChange(canonical)

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const pos = Math.min(caretPos, textareaRef.current.value.length)
          textareaRef.current.setSelectionRange(pos, pos)
          textareaRef.current.focus()
        }
      })
      return
    }

    const next = expr.trim().length === 0 ? displayLabel : `${expr.trim()} ${displayLabel}`
    setDisplayExpression(next)
    onChange(toCanonical(next))
  }

  const clear = () => !disabled && onChange("")

  const deleteLast = () => {
    if (disabled) return
    onChange(expression.trim().split(/\s+/).slice(0, -1).join(" "))
  }

  const status = result?.ok
    ? { variant: "success" as const, text: "Формула корректна" }
    : expression.trim().length === 0
      ? { variant: "idle" as const, text: "Добавьте переменные и операции" }
      : { variant: "error" as const, text: result?.error || "Ошибка" }

  return (
    <Card className={cn("p-4 space-y-4", disabled && "opacity-60 pointer-events-none")}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{title || "Формула"}</p>
          <p className="text-xs text-muted-foreground">Безопасный токенизированный ввод (без eval)</p>
        </div>
        {status.variant === "success" && (
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" /> OK
          </Badge>
        )}
        {status.variant === "error" && (
          <Badge variant="outline" className="gap-1 text-destructive border-destructive/50">
            <AlertCircle className="h-3 w-3" /> Ошибка
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Переменные (только числовые)</Label>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {availableFields.map((field) => (
                <Button
                  key={field.id}
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={() => appendToken(`{{field:${field.id}}}`, field.label)}
                >
                  {field.label}
                  <Badge variant="secondary" className="ml-2 text-[10px] px-1">
                    {field.numericSubtype === "MONEY"
                      ? "Money"
                      : field.numericSubtype === "PERCENT"
                        ? "%"
                        : "Int"}
                  </Badge>
                </Button>
              ))}
            </div>

            {availableMetrics.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Метрики</Label>
                <div className="flex flex-wrap gap-2">
                  {availableMetrics.map((metric) => (
                    <Button
                      key={metric.id}
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2 text-xs"
                      onClick={() => appendToken(`{{metric:${metric.id}}}`, metric.label)}
                    >
                      {metric.label}
                      <Badge variant="outline" className="ml-2 text-[10px] px-1">
                        {metric.numericSubtype === "MONEY" ? "Money" : metric.numericSubtype === "PERCENT" ? "%" : "Int"}
                      </Badge>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {OPERATOR_BUTTONS.map((op) => (
            <Button key={op.value} size="sm" variant="secondary" className="h-8 px-3" onClick={() => appendToken(op.value, op.value)}>
              {op.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="h-8 px-3" onClick={deleteLast}>
            <Delete className="h-3 w-3 mr-1" /> Назад
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-3" onClick={clear}>
            <X className="h-3 w-3 mr-1" /> Очистить
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Формула</Label>
          <div
            className={cn(
              "border rounded-md px-3 py-2 min-h-[52px] flex flex-wrap gap-2 items-center bg-muted/30",
              disabled && "opacity-60 pointer-events-none",
            )}
          >
            {tokensForView.length === 0 && (
              <p className="text-xs text-muted-foreground">Добавьте переменные и операции кнопками выше</p>
            )}
            {tokensForView.map((t, idx) => {
              if (t.type === "op")
                return (
                  <Badge key={`${t.raw}-${idx}`} variant="outline" className="text-xs">
                    {t.raw}
                  </Badge>
                )
              if (t.type === "percent")
                return (
                  <Badge key={`${t.raw}-${idx}`} variant="outline" className="text-xs">
                    %
                  </Badge>
                )
              if (t.type === "number")
                return (
                  <Badge key={`${t.raw}-${idx}`} variant="secondary" className="text-xs">
                    {t.raw}
                  </Badge>
                )

              const label =
                t.type === "field"
                  ? availableFields.find((f) => f.id === t.raw)?.label || t.raw
                  : availableMetrics.find((m) => m.id === t.raw)?.label || t.raw

              return (
                <Badge key={`${t.raw}-${idx}`} variant="secondary" className="text-xs">
                  {label}
                </Badge>
              )
            })}
          </div>
          <Textarea
            ref={textareaRef}
            disabled={disabled}
            value={displayExpression}
            onChange={(e) => {
              const display = e.target.value
              setDisplayExpression(display)
              onChange(toCanonical(display))
            }}
            rows={3}
            placeholder="({{field:deposit}} + {{field:cash}}) - 2 %"
            className="sr-only"
          />
        </div>

        <div className="space-y-2">
          <Label>Пример значений</Label>
          {referencedFields.length + referencedMetrics.length === 0 && (
            <p className="text-xs text-muted-foreground">Добавьте переменные для предпросмотра</p>
          )}
          <div className="space-y-2">
            {[...referencedFields, ...referencedMetrics].map((id) => {
              const label =
                availableFields.find((f) => f.id === id)?.label ||
                availableMetrics.find((m) => m.id === id)?.label ||
                id
              return (
                <div key={id} className="flex items-center gap-2">
                  <div className="flex-1 text-sm truncate">{label}</div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-9 w-28"
                    value={sampleValues[id] ?? 0}
                    onChange={(e) => setSampleValues({ ...sampleValues, [id]: Number.parseInt(e.target.value || "0", 10) })}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <Card className={cn("p-3 border-dashed", status.variant === "error" && "border-destructive/40 bg-destructive/5")}>
          <div className="flex items-start gap-2">
            {status.variant === "success" ? (
              <Check className="h-4 w-4 text-primary mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            )}
            <div className="space-y-1">
              <p className="text-sm font-medium">{status.text}</p>
              {result?.ok && (
                <p className="text-sm">
                  Пример результата: <span className="font-semibold">{result.value}</span>
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </Card>
  )
}
