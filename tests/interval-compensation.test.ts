import { describe, expect, it } from "vitest"
import { computeIntervalCompensation, roundPayrollHourlyMinutes } from "../lib/payroll/interval-compensation"

describe("interval compensation hourly rounding", () => {
  it("rounds minutes inside each hour to 0, 30, or 60", () => {
    expect(roundPayrollHourlyMinutes(0)).toBe(0)
    expect(roundPayrollHourlyMinutes(14)).toBe(0)
    expect(roundPayrollHourlyMinutes(15)).toBe(30)
    expect(roundPayrollHourlyMinutes(30)).toBe(30)
    expect(roundPayrollHourlyMinutes(44)).toBe(30)
    expect(roundPayrollHourlyMinutes(45)).toBe(60)
    expect(roundPayrollHourlyMinutes(59)).toBe(60)
    expect(roundPayrollHourlyMinutes(60)).toBe(60)
    expect(roundPayrollHourlyMinutes(74)).toBe(60)
    expect(roundPayrollHourlyMinutes(75)).toBe(90)
    expect(roundPayrollHourlyMinutes(105)).toBe(120)
  })

  it("uses rounded minutes for hourly pay accrual", () => {
    const compensationFor = (minutesWorked: number) =>
      computeIntervalCompensation({
        interval: { status: "closed", revenueCents: null },
        minutesWorked,
        components: [{ componentType: "hourly", amountCents: 1_000, rateBp: null }],
      })

    expect(compensationFor(14).hourlyPayCents).toBe(0)
    expect(compensationFor(15).hourlyPayCents).toBe(500)
    expect(compensationFor(44).hourlyPayCents).toBe(500)
    expect(compensationFor(45).hourlyPayCents).toBe(1_000)
    expect(compensationFor(75).hourlyPayCents).toBe(1_500)
  })
})
