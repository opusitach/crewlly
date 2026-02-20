import { Prisma } from "@prisma/client"

const REVENUE_BASIS_MISSING_MESSAGE =
  "Нельзя назначить оплату «% от выручки». Сначала в Настройки -> Касса выберите поле, которое будет источником выручки для процента."

const REVENUE_BASIS_AMBIGUOUS_MESSAGE =
  "Нельзя назначить оплату «% от выручки». В кассе отмечено несколько полей-источников. Оставьте только одно поле для расчета процента."

export type PercentRevenueValidationResult =
  | { ok: true; locationId: string; fieldKey: string }
  | { ok: false; error: string }

export async function ensurePercentRevenueCashBasis(input: {
  tx: Prisma.TransactionClient
  organizationId: string
  employeeId?: string
  locationId?: string
}): Promise<PercentRevenueValidationResult> {
  const locationId = await resolveTargetLocationId(input)

  if (!locationId) {
    return { ok: false, error: REVENUE_BASIS_MISSING_MESSAGE }
  }

  const basisFields = await input.tx.cashRegisterField.findMany({
    where: {
      locationId,
      isActive: true,
      isRevenueBasis: true,
    },
    select: { key: true },
  })

  if (basisFields.length === 0) {
    return { ok: false, error: REVENUE_BASIS_MISSING_MESSAGE }
  }

  if (basisFields.length > 1) {
    return { ok: false, error: REVENUE_BASIS_AMBIGUOUS_MESSAGE }
  }

  return {
    ok: true,
    locationId,
    fieldKey: basisFields[0].key,
  }
}

async function resolveTargetLocationId(input: {
  tx: Prisma.TransactionClient
  organizationId: string
  employeeId?: string
  locationId?: string
}) {
  if (input.locationId) {
    return input.locationId
  }

  if (input.employeeId) {
    const primary = await input.tx.employeeLocation.findFirst({
      where: {
        employeeId: input.employeeId,
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { locationId: true },
    })

    if (primary?.locationId) {
      return primary.locationId
    }
  }

  const firstLocation = await input.tx.location.findFirst({
    where: { organizationId: input.organizationId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })

  return firstLocation?.id ?? null
}
