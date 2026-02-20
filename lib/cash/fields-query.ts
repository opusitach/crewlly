import { Prisma } from "@prisma/client"

type QueryExecutor = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
}

type ExecExecutor = QueryExecutor & {
  $executeRaw(query: Prisma.Sql): Promise<number>
}

export type CashRegisterFieldRow = {
  id: string
  locationId: string
  key: string
  label: string
  inputStage: string
  valueType: string
  defaultSign: number
  isRequired: boolean
  isPhotoRequired: boolean
  isRevenueBasis: boolean
  isActive: boolean
  displayOrder: number
}

export async function listCashRegisterFields(
  db: QueryExecutor,
  input: {
    locationId: string
    isActive?: boolean
    inputStage?: "open" | "close"
    key?: string
  },
) {
  const filters: Prisma.Sql[] = [Prisma.sql`"location_id" = ${input.locationId}::uuid`]
  if (typeof input.isActive === "boolean") {
    filters.push(Prisma.sql`"is_active" = ${input.isActive}`)
  }
  if (input.inputStage) {
    filters.push(Prisma.sql`"input_stage" = ${input.inputStage}`)
  }
  if (input.key) {
    filters.push(Prisma.sql`"key" = ${input.key}`)
  }

  const query = Prisma.sql`
    SELECT
      "id",
      "location_id" AS "locationId",
      "key",
      "label",
      "input_stage" AS "inputStage",
      "value_type" AS "valueType",
      "default_sign" AS "defaultSign",
      "is_required" AS "isRequired",
      COALESCE("is_photo_required", false) AS "isPhotoRequired",
      "is_revenue_basis" AS "isRevenueBasis",
      "is_active" AS "isActive",
      "display_order" AS "displayOrder"
    FROM "cash_register_fields"
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY "input_stage" ASC, "display_order" ASC, "key" ASC
  `

  return db.$queryRaw<CashRegisterFieldRow[]>(query)
}

export async function setCashRegisterFieldPhotoRequired(
  db: ExecExecutor,
  input: {
    id: string
    isPhotoRequired: boolean
  },
) {
  await db.$executeRaw(Prisma.sql`
    UPDATE "cash_register_fields"
    SET "is_photo_required" = ${input.isPhotoRequired}
    WHERE "id" = ${input.id}::uuid
  `)
}
