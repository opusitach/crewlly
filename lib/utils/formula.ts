export type NumericSubtype = "MONEY" | "INTEGER" | "PERCENT"

type Token =
  | { type: "number"; value: bigint }
  | { type: "variable"; id: string; scope: "field" | "metric" }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" }
  | { type: "percent" }

type RpnToken =
  | { type: "number"; value: bigint }
  | { type: "variable"; id: string; scope: "field" | "metric" }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "percent" }

const OP_PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 }

type NumericValue = {
  num: bigint
  den: bigint
  subtype: NumericSubtype | "UNKNOWN"
}

type PercentNode = { kind: "percent"; payload: NumericValue }

export type EvalResult = {
  ok: boolean
  value?: number
  error?: string
  referencedFieldIds: string[]
  referencedMetricIds: string[]
}

export type FieldMetaIndex = Record<string, { numericSubtype: NumericSubtype }>

export type MetricDefinition = {
  id: string
  name: string
  numericSubtype: NumericSubtype
  expression: string
  referencedFieldIds: string[]
  referencedMetricIds: string[]
  updatedAt: string
}

export function extractReferencedFields(expression: string): string[] {
  const ids = new Set<string>()
  const regex = /\{\{field:([^}]+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(expression))) {
    ids.add(match[1])
  }
  return Array.from(ids)
}

export function extractReferencedMetrics(expression: string): string[] {
  const ids = new Set<string>()
  const regex = /\{\{metric:([^}]+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(expression))) {
    ids.add(match[1])
  }
  return Array.from(ids)
}

function makeValue(value: bigint, subtype: NumericSubtype | "UNKNOWN"): NumericValue {
  return { num: value, den: 1n, subtype }
}

function cloneValue(v: NumericValue, override?: Partial<NumericValue>): NumericValue {
  return { ...v, ...override }
}

function normalizeForAdd(left: NumericValue, right: NumericValue): { left: NumericValue; right: NumericValue } | string {
  if (left.subtype === "UNKNOWN" && right.subtype !== "UNKNOWN") return { left: cloneValue(left, { subtype: right.subtype }), right }
  if (right.subtype === "UNKNOWN" && left.subtype !== "UNKNOWN") return { left, right: cloneValue(right, { subtype: left.subtype }) }
  if (left.subtype === right.subtype) return { left, right }
  return "Смешаны несовместимые типы (деньги/количество). Уточните тип полей."
}

function normalizeForMultiply(a: NumericValue, b: NumericValue): { resultSubtype: NumericSubtype } | string {
  const subtypes = [a.subtype, b.subtype]
  if (subtypes.includes("PERCENT")) return "Процент можно применять только через + или - (X ± P%)."
  if (a.subtype === "UNKNOWN" && b.subtype !== "UNKNOWN") return { resultSubtype: b.subtype }
  if (b.subtype === "UNKNOWN" && a.subtype !== "UNKNOWN") return { resultSubtype: a.subtype }
  if (a.subtype === "MONEY" && b.subtype === "INTEGER") return { resultSubtype: "MONEY" }
  if (a.subtype === "INTEGER" && b.subtype === "MONEY") return { resultSubtype: "MONEY" }
  if (a.subtype === "INTEGER" && b.subtype === "INTEGER") return { resultSubtype: "INTEGER" }
  return "Недопустимая операция умножения для выбранных типов"
}

function normalizeForDivide(a: NumericValue, b: NumericValue): { resultSubtype: NumericSubtype } | string {
  if (b.num === 0n) return "Деление на ноль"
  if (a.subtype === "MONEY" && b.subtype === "INTEGER") return { resultSubtype: "MONEY" }
  if (a.subtype === "INTEGER" && b.subtype === "INTEGER") return { resultSubtype: "INTEGER" }
  if (a.subtype === "UNKNOWN" && b.subtype !== "UNKNOWN") return { resultSubtype: b.subtype }
  if (b.subtype === "UNKNOWN" && a.subtype !== "UNKNOWN") return { resultSubtype: a.subtype }
  return "Деление возможно только на целочисленное значение"
}

function tokenize(expression: string): { tokens: Token[]; error?: string } {
  const result: Token[] = []
  const regex = /\{\{(field|metric):([^}]+)\}\}|[0-9]+|[+\-*/()%-]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(expression))) {
    const [raw, scope, scopedId] = match
    if (scope && scopedId) {
      result.push({ type: "variable", id: scopedId, scope: scope as "field" | "metric" })
      continue
    }
    if (/^[0-9]+$/.test(raw)) {
      result.push({ type: "number", value: BigInt(Number.parseInt(raw, 10)) })
      continue
    }
    if (raw === "+" || raw === "-" || raw === "*" || raw === "/") {
      result.push({ type: "op", value: raw })
      continue
    }
    if (raw === "(" || raw === ")") {
      result.push({ type: "paren", value: raw })
      continue
    }
    if (raw === "%") {
      result.push({ type: "percent" })
      continue
    }
  }
  return { tokens: result }
}

function toRpn(tokens: Token[]): { rpn: RpnToken[]; error?: string } {
  const output: RpnToken[] = []
  const stack: Token[] = []
  for (const token of tokens) {
    if (token.type === "number" || token.type === "variable") {
      output.push(token)
      continue
    }
    if (token.type === "percent") {
      output.push({ type: "percent" })
      continue
    }
    if (token.type === "op") {
      while (stack.length > 0) {
        const top = stack[stack.length - 1]
        if (top.type === "op" && OP_PRECEDENCE[top.value] >= OP_PRECEDENCE[token.value]) {
          output.push(stack.pop() as RpnToken)
        } else {
          break
        }
      }
      stack.push(token)
      continue
    }
    if (token.type === "paren" && token.value === "(") {
      stack.push(token)
      continue
    }
    if (token.type === "paren" && token.value === ")") {
      let foundLeft = false
      while (stack.length > 0) {
        const top = stack.pop()!
        if (top.type === "paren" && top.value === "(") {
          foundLeft = true
          break
        }
        output.push(top as RpnToken)
      }
      if (!foundLeft) return { rpn: [], error: "Скобки не сбалансированы" }
    }
  }
  while (stack.length > 0) {
    const top = stack.pop()!
    if (top.type === "paren") return { rpn: [], error: "Скобки не сбалансированы" }
    output.push(top as RpnToken)
  }
  return { rpn: output }
}

function isPercentNode(val: any): val is PercentNode {
  return val && val.kind === "percent"
}

function roundRational(value: NumericValue): number {
  const asNumber = Number(value.num) / Number(value.den)
  return Math.round(asNumber)
}

function toPercentNode(value: NumericValue): PercentNode | string {
  if (value.subtype === "PERCENT" || value.subtype === "INTEGER" || value.subtype === "UNKNOWN") {
    return { kind: "percent", payload: cloneValue(value, { subtype: "PERCENT" }) }
  }
  return "Процент должен быть задан числом или полем с типом %/целое"
}

export function evaluateFormula(
  expression: string,
  variables: Record<string, number>,
  options?: { fieldMeta?: FieldMetaIndex; metricMeta?: FieldMetaIndex },
): EvalResult {
  const trimmed = expression.trim()
  const referencedFieldIds = extractReferencedFields(trimmed)
  const referencedMetricIds = extractReferencedMetrics(trimmed)
  if (!trimmed) return { ok: false, error: "Формула пуста", referencedFieldIds, referencedMetricIds }

  const { tokens, error: tokError } = tokenize(trimmed)
  if (tokError) return { ok: false, error: tokError, referencedFieldIds, referencedMetricIds }

  const { rpn, error: rpnError } = toRpn(tokens)
  if (rpnError) return { ok: false, error: rpnError, referencedFieldIds, referencedMetricIds }

  const stack: Array<NumericValue | PercentNode> = []
  const mergedMeta: FieldMetaIndex = { ...(options?.fieldMeta || {}), ...(options?.metricMeta || {}) }

  for (const t of rpn) {
    if (t.type === "number") {
      stack.push(makeValue(t.value, "UNKNOWN"))
      continue
    }
    if (t.type === "variable") {
      const meta = mergedMeta[t.id]
      if (!meta) {
        return {
          ok: false,
          error: t.scope === "metric" ? `Неизвестная метрика ${t.id}` : `Неизвестное поле ${t.id}`,
          referencedFieldIds,
          referencedMetricIds,
        }
      }
      if (!(t.id in variables)) {
        return {
          ok: false,
          error: t.scope === "metric" ? `Заполните метрику ${t.id} для расчёта` : `Заполните поле ${t.id} для расчёта`,
          referencedFieldIds,
          referencedMetricIds,
        }
      }
      stack.push(makeValue(BigInt(variables[t.id]), meta.numericSubtype))
      continue
    }
    if (t.type === "percent") {
      const a = stack.pop()
      if (!a || isPercentNode(a)) return { ok: false, error: "Некорректное использование %", referencedFieldIds, referencedMetricIds }
      const percentNode = toPercentNode(a)
      if (typeof percentNode === "string") return { ok: false, error: percentNode, referencedFieldIds, referencedMetricIds }
      stack.push(percentNode)
      continue
    }
    if (t.type === "op") {
      const right = stack.pop()
      const left = stack.pop()
      if (!left || !right) {
        return { ok: false, error: "Недостаточно операндов", referencedFieldIds, referencedMetricIds }
      }

      if ((t.value === "*" || t.value === "/") && (isPercentNode(left) || isPercentNode(right))) {
        return { ok: false, error: "Процент можно применять только как +P% или -P%", referencedFieldIds, referencedMetricIds }
      }

      if (t.value === "+" || t.value === "-") {
        const sign = t.value === "+" ? 1n : -1n
        if (isPercentNode(right)) {
          const base = left
          const pct = right.payload
          if (pct.subtype !== "PERCENT") {
            return { ok: false, error: "Процент нужно пометить знаком %", referencedFieldIds, referencedMetricIds }
          }
          const numerator = base.num * (pct.den * 100n + sign * pct.num)
          const denominator = base.den * pct.den * 100n
          stack.push({ num: numerator, den: denominator, subtype: base.subtype })
          continue
        }
        if (isPercentNode(left)) return { ok: false, error: "Процент не может быть слева от операции", referencedFieldIds, referencedMetricIds }
        const normalized = normalizeForAdd(left, right as NumericValue)
        if (typeof normalized === "string") return { ok: false, error: normalized, referencedFieldIds, referencedMetricIds }
        const l = normalized.left
        const r = normalized.right
        const lNum = l.num * r.den
        const rNum = r.num * l.den
        stack.push({ num: t.value === "+" ? lNum + rNum : lNum - rNum, den: l.den * r.den, subtype: l.subtype })
        continue
      }

      if (isPercentNode(right) || isPercentNode(left)) {
        return { ok: false, error: "Процент применяйте только через + или -", referencedFieldIds, referencedMetricIds }
      }

      if (t.value === "*") {
        const validation = normalizeForMultiply(left, right)
        if (typeof validation === "string") return { ok: false, error: validation, referencedFieldIds, referencedMetricIds }
        stack.push({
          num: left.num * right.num,
          den: left.den * right.den,
          subtype: validation.resultSubtype,
        })
        continue
      }

      if (t.value === "/") {
        const validation = normalizeForDivide(left, right)
        if (typeof validation === "string") return { ok: false, error: validation, referencedFieldIds, referencedMetricIds }
        stack.push({
          num: left.num * right.den,
          den: left.den * right.num,
          subtype: validation.resultSubtype,
        })
      }
    }
  }

  if (stack.length !== 1) {
    return { ok: false, error: "Формула некорректна", referencedFieldIds, referencedMetricIds }
  }

  const single = stack[0]
  if (isPercentNode(single)) return { ok: false, error: "Хвостовой % без операции + или -", referencedFieldIds, referencedMetricIds }

  return { ok: true, value: roundRational(single), referencedFieldIds, referencedMetricIds }
}

export function evaluateMetrics(
  metrics: MetricDefinition[],
  fieldValues: Record<string, number>,
  fieldMeta: FieldMetaIndex,
): { ok: true; values: Record<string, number> } | { ok: false; error: string } {
  const metricMeta: FieldMetaIndex = Object.fromEntries(metrics.map((m) => [m.id, { numericSubtype: m.numericSubtype }]))
  const values: Record<string, number> = {}
  const visiting = new Set<string>()
  const done = new Set<string>()

  const byId = new Map(metrics.map((m) => [m.id, m]))

  const compute = (metricId: string): string | void => {
    if (done.has(metricId)) return
    if (visiting.has(metricId)) return `Обнаружен цикл в метриках (${metricId})`
    const metric = byId.get(metricId)
    if (!metric) return `Метрика ${metricId} не найдена`

    visiting.add(metricId)
    const refs = metric.referencedMetricIds && metric.referencedMetricIds.length > 0
      ? metric.referencedMetricIds
      : extractReferencedMetrics(metric.expression)

    for (const depId of refs) {
      const err = compute(depId)
      if (err) return err
    }

    const context = { ...fieldValues, ...values }
    const res = evaluateFormula(metric.expression, context, { fieldMeta, metricMeta })
    if (!res.ok || typeof res.value !== "number") {
      return res.error || `Не удалось вычислить метрику ${metric.name || metric.id}`
    }
    values[metricId] = res.value
    visiting.delete(metricId)
    done.add(metricId)
  }

  for (const metric of metrics) {
    const err = compute(metric.id)
    if (err) return { ok: false, error: err }
  }

  return { ok: true, values }
}


