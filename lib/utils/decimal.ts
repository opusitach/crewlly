import { Decimal } from "@prisma/client/runtime/library"

/**
 * Converts a Prisma Decimal to a JavaScript number.
 * Returns null if input is null/undefined.
 */
export function decimalToNumber(value: Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return value.toNumber()
}

/**
 * Converts a JavaScript number to a value suitable for Prisma Decimal field.
 * Returns undefined if input is null/undefined (for optional fields).
 */
export function numberToDecimal(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  return value
}

/**
 * Formats a Decimal or number as currency string.
 * @param value - Decimal or number value
 * @param currency - Currency code (default: CZK)
 * @param locale - Locale for formatting (default: cs-CZ)
 */
export function formatCurrency(
  value: Decimal | number | null | undefined,
  currency = "CZK",
  locale = "cs-CZ"
): string {
  if (value === null || value === undefined) return "—"
  const num = typeof value === "number" ? value : value.toNumber()
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(num)
}

/**
 * Safely parses a string/number to a number for Decimal fields.
 * Returns null for invalid inputs.
 */
export function parseDecimalInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const num = typeof value === "string" ? parseFloat(value) : value
  if (isNaN(num)) return null
  // Round to 2 decimal places for money values
  return Math.round(num * 100) / 100
}

