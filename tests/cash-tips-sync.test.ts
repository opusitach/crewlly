import { describe, expect, it } from "vitest"
import { buildProcedureCashValueMap } from "../lib/cash/tips-sync"
import { evaluateCashFormulaExpression, extractCashFormulaKeys } from "../lib/cash/formula"

describe("tips sync procedure fallback", () => {
  it("builds numeric value map from open and close CASH answers", () => {
    const map = buildProcedureCashValueMap({
      openPackedValues: ["10000"],
      closePackedValues: ["35000|2000|500"],
      openFieldKeys: ["deposit"],
      closeFieldKeys: ["day_revenue", "tips_total", "refunds"],
      formulaKeys: new Set(["deposit", "day_revenue", "tips_total", "refunds"]),
    })

    expect(map.deposit).toBe(1000000)
    expect(map.day_revenue).toBe(3500000)
    expect(map.tips_total).toBe(200000)
    expect(map.refunds).toBe(50000)
  })

  it("uses latest non-empty value when multiple answers exist", () => {
    const map = buildProcedureCashValueMap({
      openPackedValues: ["1000", "1200"],
      closePackedValues: ["3000|700", "3500|"],
      openFieldKeys: ["deposit"],
      closeFieldKeys: ["day_revenue", "tips_total"],
      formulaKeys: new Set(["deposit", "day_revenue", "tips_total"]),
    })

    expect(map.deposit).toBe(120000)
    expect(map.day_revenue).toBe(350000)
    // Empty token in the latest payload must not erase previously known value.
    expect(map.tips_total).toBe(70000)
  })

  it("keeps missing fields as zero", () => {
    const map = buildProcedureCashValueMap({
      openPackedValues: [""],
      closePackedValues: [""],
      openFieldKeys: ["deposit"],
      closeFieldKeys: ["tips_total"],
      formulaKeys: new Set(["deposit", "tips_total", "service_fee"]),
    })

    expect(map.deposit).toBe(0)
    expect(map.tips_total).toBe(0)
    expect(map.service_fee).toBe(0)
  })

  it("calculates tips in cents for procedure inputs entered in whole currency units", () => {
    const expression = "( kesh_kassa - kesh_uzaverka - depozit ) + ( terminal - terminal_uzaverka - 21% )"
    const formulaKeys = new Set(extractCashFormulaKeys(expression))
    const map = buildProcedureCashValueMap({
      openPackedValues: ["1300"],
      closePackedValues: ["20000|23000|14000|15000"],
      openFieldKeys: ["depozit"],
      closeFieldKeys: ["terminal_uzaverka", "terminal", "kesh_uzaverka", "kesh_kassa"],
      formulaKeys,
    })

    const result = evaluateCashFormulaExpression(expression, map, formulaKeys)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(207000)
    }
  })
})
