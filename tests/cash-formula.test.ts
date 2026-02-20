import { describe, expect, it } from "vitest"
import {
  evaluateCashFormulaExpression,
  validateAndCompileCashFormulaSet,
  validateCashFormulaExpression,
} from "../lib/cash/formula"

describe("cash formula", () => {
  it("evaluates simple subtraction", () => {
    const result = evaluateCashFormulaExpression(
      "day_revenue - deposit",
      {
        day_revenue: 45000,
        deposit: 10000,
      },
      new Set(["day_revenue", "deposit"]),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(35000)
      expect(result.referencedKeys).toEqual(["day_revenue", "deposit"])
    }
  })

  it("supports parentheses and unary minus", () => {
    const result = evaluateCashFormulaExpression(
      "income - (refunds + fees) - -bonus",
      {
        income: 1000,
        refunds: 100,
        fees: 50,
        bonus: 20,
      },
      new Set(["income", "refunds", "fees", "bonus"]),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(870)
    }
  })

  it("supports subtracting integer percent from current expression", () => {
    const result = evaluateCashFormulaExpression(
      "income - 10%",
      {
        income: 1000,
      },
      new Set(["income"]),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(900)
    }
  })

  it("rounds percent subtraction to nearest cent", () => {
    const result = evaluateCashFormulaExpression(
      "income - 33%",
      {
        income: 5,
      },
      new Set(["income"]),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(3)
    }
  })

  it("rejects unknown fields", () => {
    const result = evaluateCashFormulaExpression("income - tax", { income: 100 }, new Set(["income"]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Неизвестное поле")
    }
  })

  it("rejects unsupported symbols", () => {
    const result = evaluateCashFormulaExpression("income * tax", { income: 100, tax: 10 }, new Set(["income", "tax"]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Недопустимый символ")
    }
  })

  it("requires at least one referenced field on validation", () => {
    const result = validateCashFormulaExpression("100 - 50", new Set(["income"]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("хотя бы одно поле")
    }
  })

  it("rejects percent outside range 0..100", () => {
    const result = evaluateCashFormulaExpression("income - 120%", { income: 1000 }, new Set(["income"]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("диапазоне")
    }
  })

  it("allows using previously created calculation in next formula", () => {
    const result = validateAndCompileCashFormulaSet(
      [
        {
          resultKey: "gross_income",
          resultLabel: "Валовый доход",
          expression: "day_revenue - deposit",
          displayOrder: 0,
        },
        {
          resultKey: "net_income",
          resultLabel: "Чистый доход",
          expression: "gross_income - refunds",
          displayOrder: 1,
        },
      ],
      new Set(["day_revenue", "deposit", "refunds"]),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.compiledExpressionsByKey.net_income).toContain("(day_revenue - deposit)")
    }
  })

  it("rejects reference to a formula created later in the list", () => {
    const result = validateAndCompileCashFormulaSet(
      [
        {
          resultKey: "net_income",
          resultLabel: "Чистый доход",
          expression: "gross_income - refunds",
          displayOrder: 0,
        },
        {
          resultKey: "gross_income",
          resultLabel: "Валовый доход",
          expression: "day_revenue - deposit",
          displayOrder: 1,
        },
      ],
      new Set(["day_revenue", "deposit", "refunds"]),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("ранее созданные расчеты")
    }
  })
})
