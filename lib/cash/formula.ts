const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/

type Token =
  | { type: "identifier"; value: string }
  | { type: "number"; value: bigint }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "percent" }
  | { type: "lparen" }
  | { type: "rparen" }

type FormulaResult =
  | { ok: true; value: number; referencedKeys: string[] }
  | { ok: false; error: string; referencedKeys: string[] }

export type CashFormulaDefinition = {
  resultKey: string
  resultLabel?: string
  expression: string
  displayOrder?: number
}

type CashFormulaValidationResult =
  | { ok: true; orderedFormulas: CashFormulaDefinition[]; compiledExpressionsByKey: Record<string, string> }
  | { ok: false; error: string }

class CashFormulaParser {
  private index = 0

  constructor(
    private readonly tokens: Token[],
    private readonly values: Record<string, number>,
    private readonly allowedKeys?: Set<string>,
    private readonly referencedKeys: Set<string> = new Set<string>(),
  ) {}

  parse(): FormulaResult {
    try {
      const value = this.parseExpression()
      if (!this.isAtEnd()) {
        throw new Error("Формула содержит лишние символы")
      }

      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
      const minSafe = BigInt(Number.MIN_SAFE_INTEGER)
      if (value > maxSafe || value < minSafe) {
        throw new Error("Результат формулы выходит за безопасный диапазон целых чисел")
      }

      return {
        ok: true,
        value: Number(value),
        referencedKeys: Array.from(this.referencedKeys),
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Некорректная формула",
        referencedKeys: Array.from(this.referencedKeys),
      }
    }
  }

  private parseExpression(): bigint {
    let value = this.parseFactor()

    while (true) {
      if (this.match("plus")) {
        value += this.parseAdditiveOperand(value)
        continue
      }
      if (this.match("minus")) {
        value -= this.parseAdditiveOperand(value)
        continue
      }
      return value
    }
  }

  private parseAdditiveOperand(currentValue: bigint): bigint {
    if (this.isPercentLiteralAhead()) {
      const percent = this.parsePercentLiteral()
      return this.roundDivide(currentValue * percent, BigInt(100))
    }
    return this.parseFactor()
  }

  private parseFactor(): bigint {
    if (this.match("minus")) {
      return -this.parseFactor()
    }

    if (this.match("lparen")) {
      const nested = this.parseExpression()
      this.expect("rparen", "Не закрыта скобка")
      return nested
    }

    const token = this.peek()
    if (!token) {
      throw new Error("Ожидалось число или переменная")
    }

    if (token.type === "number") {
      this.index += 1
      return token.value
    }

    if (token.type === "identifier") {
      this.index += 1
      return this.resolveIdentifier(token.value)
    }

    throw new Error("Ожидалось число или переменная")
  }

  private resolveIdentifier(key: string): bigint {
    if (this.allowedKeys && !this.allowedKeys.has(key)) {
      throw new Error(`Неизвестное поле в формуле: ${key}`)
    }

    if (!(key in this.values)) {
      throw new Error(`Не передано значение для поля: ${key}`)
    }

    const raw = this.values[key]
    if (!Number.isInteger(raw)) {
      throw new Error(`Поле ${key} должно быть целым числом`)
    }

    this.referencedKeys.add(key)
    return BigInt(raw)
  }

  private isPercentLiteralAhead() {
    const token = this.peek()
    const next = this.tokens[this.index + 1]
    return token?.type === "number" && next?.type === "percent"
  }

  private parsePercentLiteral(): bigint {
    const token = this.peek()
    if (!token || token.type !== "number") {
      throw new Error("Ожидалось целое значение процента")
    }

    this.index += 1
    this.expect("percent", "После процента ожидался символ %")

    if (token.value < BigInt(0) || token.value > BigInt(100)) {
      throw new Error("Процент должен быть в диапазоне от 0 до 100")
    }

    return token.value
  }

  private roundDivide(numerator: bigint, denominator: bigint): bigint {
    if (denominator === BigInt(0)) throw new Error("Деление на ноль в формуле")
    const isNegative = numerator < BigInt(0)
    const absolute = isNegative ? -numerator : numerator
    const rounded = (absolute + denominator / BigInt(2)) / denominator
    return isNegative ? -rounded : rounded
  }

  private isAtEnd() {
    return this.index >= this.tokens.length
  }

  private peek() {
    return this.tokens[this.index]
  }

  private match(type: Token["type"]) {
    const token = this.peek()
    if (!token || token.type !== type) return false
    this.index += 1
    return true
  }

  private expect(type: Token["type"], message: string) {
    if (!this.match(type)) {
      throw new Error(message)
    }
  }
}

export function extractCashFormulaKeys(expression: string): string[] {
  const keys = new Set<string>()
  const tokens = tokenizeCashFormula(expression)
  if (!tokens.ok) return []

  for (const token of tokens.tokens) {
    if (token.type === "identifier") {
      keys.add(token.value)
    }
  }

  return Array.from(keys)
}

export function validateCashFormulaExpression(expression: string, allowedKeys: Set<string>): FormulaResult {
  const defaultValues: Record<string, number> = {}
  for (const key of allowedKeys) {
    defaultValues[key] = 0
  }

  const result = evaluateCashFormulaExpression(expression, defaultValues, allowedKeys)
  if (!result.ok) return result

  if (result.referencedKeys.length === 0) {
    return {
      ok: false,
      error: "Формула должна содержать хотя бы одно поле",
      referencedKeys: [],
    }
  }

  return result
}

export function evaluateCashFormulaExpression(
  expression: string,
  values: Record<string, number>,
  allowedKeys?: Set<string>,
): FormulaResult {
  const trimmed = expression.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: "Формула пуста",
      referencedKeys: [],
    }
  }

  const tokens = tokenizeCashFormula(trimmed)
  if (!tokens.ok) {
    return {
      ok: false,
      error: tokens.error,
      referencedKeys: [],
    }
  }

  const parser = new CashFormulaParser(tokens.tokens, values, allowedKeys)
  return parser.parse()
}

export function validateAndCompileCashFormulaSet(
  formulas: CashFormulaDefinition[],
  allowedFieldKeys: Set<string>,
): CashFormulaValidationResult {
  if (formulas.length === 0) {
    return {
      ok: false,
      error: "Добавьте хотя бы одну формулу",
    }
  }

  const orderedFormulas = sortCashFormulasForExecution(formulas)
  const staticFieldValues: Record<string, number> = {}
  for (const key of allowedFieldKeys) {
    staticFieldValues[key] = 0
  }

  const computedFormulaValues: Record<string, number> = {}
  const compiledExpressionsByKey: Record<string, string> = {}
  const availableFormulaKeys = new Set<string>()

  for (const formula of orderedFormulas) {
    const formulaTitle = formula.resultLabel?.trim() || formula.resultKey
    const availableKeys = new Set<string>([...allowedFieldKeys, ...availableFormulaKeys])
    const referencedKeys = extractCashFormulaKeys(formula.expression)

    for (const referencedKey of referencedKeys) {
      if (!availableKeys.has(referencedKey)) {
        return {
          ok: false,
          error: `Ошибка в формуле «${formulaTitle}»: можно использовать только поля и ранее созданные расчеты. Неизвестный ключ: ${referencedKey}`,
        }
      }
    }

    const evaluation = evaluateCashFormulaExpression(
      formula.expression,
      {
        ...staticFieldValues,
        ...computedFormulaValues,
      },
      availableKeys,
    )
    if (!evaluation.ok) {
      return {
        ok: false,
        error: `Ошибка в формуле «${formulaTitle}»: ${evaluation.error}`,
      }
    }

    if (evaluation.referencedKeys.length === 0) {
      return {
        ok: false,
        error: `Ошибка в формуле «${formulaTitle}»: формула должна содержать хотя бы одно поле или ранее созданный расчет`,
      }
    }

    const compiledExpression = inlineFormulaReferences(formula.expression, compiledExpressionsByKey)
    compiledExpressionsByKey[formula.resultKey] = compiledExpression
    computedFormulaValues[formula.resultKey] = evaluation.value
    availableFormulaKeys.add(formula.resultKey)
  }

  return {
    ok: true,
    orderedFormulas,
    compiledExpressionsByKey,
  }
}

function sortCashFormulasForExecution(formulas: CashFormulaDefinition[]) {
  return formulas
    .map((formula, index) => ({
      ...formula,
      displayOrder: Number.isInteger(formula.displayOrder) ? Number(formula.displayOrder) : index,
      _originalIndex: index,
    }))
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder
      }
      return a._originalIndex - b._originalIndex
    })
    .map((formula) => ({
      resultKey: formula.resultKey,
      resultLabel: formula.resultLabel,
      expression: formula.expression,
      displayOrder: formula.displayOrder,
    }))
}

function inlineFormulaReferences(expression: string, compiledByKey: Record<string, string>) {
  let nextExpression = expression
  const referencedKeys = extractCashFormulaKeys(expression)

  for (const key of referencedKeys) {
    const compiled = compiledByKey[key]
    if (!compiled) continue
    const pattern = new RegExp(`\\b${escapeRegex(key)}\\b`, "g")
    nextExpression = nextExpression.replace(pattern, `(${compiled})`)
  }

  return nextExpression
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function tokenizeCashFormula(expression: string):
  | { ok: true; tokens: Token[] }
  | { ok: false; error: string } {
  const tokens: Token[] = []
  let index = 0

  while (index < expression.length) {
    const char = expression[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char === "+") {
      tokens.push({ type: "plus" })
      index += 1
      continue
    }

    if (char === "-") {
      tokens.push({ type: "minus" })
      index += 1
      continue
    }

    if (char === "%") {
      tokens.push({ type: "percent" })
      index += 1
      continue
    }

    if (char === "(") {
      tokens.push({ type: "lparen" })
      index += 1
      continue
    }

    if (char === ")") {
      tokens.push({ type: "rparen" })
      index += 1
      continue
    }

    if (/\d/.test(char)) {
      let numberValue = char
      index += 1
      while (index < expression.length && /\d/.test(expression[index])) {
        numberValue += expression[index]
        index += 1
      }
      tokens.push({ type: "number", value: BigInt(numberValue) })
      continue
    }

    if (/[A-Za-z_]/.test(char)) {
      let identifier = char
      index += 1
      while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index])) {
        identifier += expression[index]
        index += 1
      }

      if (!IDENTIFIER_REGEX.test(identifier)) {
        return {
          ok: false,
          error: `Некорректный идентификатор: ${identifier}`,
        }
      }

      tokens.push({ type: "identifier", value: identifier })
      continue
    }

    return {
      ok: false,
      error: `Недопустимый символ в формуле: ${char}`,
    }
  }

  return { ok: true, tokens }
}
