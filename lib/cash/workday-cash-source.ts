import { Prisma, ProcedureWhen } from "@prisma/client"
import {
  getMissingCashProcedurePhotoFieldKeys,
  hasRequiredCashProcedureValues,
  normalizeCashProcedurePhotoMap,
  type CashProcedureFieldMeta,
} from "@/lib/cash/procedure-values"

type CashSourceDb = Pick<Prisma.TransactionClient, "workIntervalProcedureAnswer">

export type WorkdayCashSourceAnswer = {
  answerId: string
  workIntervalId: string
  when: ProcedureWhen
  inputValue: string
  cashPhotosJson: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}

export type WorkdayCashSourceSelectionMode = "first" | "non_empty" | "complete"
export type WorkdayCashSourceFieldMeta = Pick<CashProcedureFieldMeta, "key" | "isRequired" | "isPhotoRequired">

type FindWorkdayCashSourceSelection = {
  mode?: WorkdayCashSourceSelectionMode
  fieldsByWhen?: Partial<Record<ProcedureWhen, WorkdayCashSourceFieldMeta[]>>
}

type FindWorkdayCashSourceAnswersInput = {
  workdayId: string
  whens?: ProcedureWhen[]
  selection?: FindWorkdayCashSourceSelection
}

type FindWorkdayCashSourceAnswerInput = {
  workdayId: string
  when: ProcedureWhen
  selectionMode?: WorkdayCashSourceSelectionMode
  fields?: WorkdayCashSourceFieldMeta[]
}

type CashAnswerRow = {
  id: string
  workIntervalId: string
  when: ProcedureWhen
  inputValue: string | null
  cashPhotosJson: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}

const hasMeaningfulCashAnswerData = (answer: Pick<CashAnswerRow, "inputValue" | "cashPhotosJson">) => {
  const normalizedInput = (answer.inputValue ?? "").trim()
  if (normalizedInput.length > 0) return true
  const photos = normalizeCashProcedurePhotoMap(answer.cashPhotosJson)
  return Object.keys(photos).length > 0
}

const isCompleteCashAnswerForStage = (
  answer: Pick<CashAnswerRow, "when" | "inputValue" | "cashPhotosJson">,
  fieldsByWhen: Partial<Record<ProcedureWhen, WorkdayCashSourceFieldMeta[]>> | undefined,
) => {
  const fields = fieldsByWhen?.[answer.when]
  if (!fields) {
    return hasMeaningfulCashAnswerData(answer)
  }
  if (fields.length === 0) {
    return true
  }
  if (!hasMeaningfulCashAnswerData(answer)) {
    return false
  }

  const requiredValuesOk = hasRequiredCashProcedureValues(
    answer.inputValue ?? null,
    fields.map((field) => ({ key: field.key, isRequired: field.isRequired })),
  )
  if (!requiredValuesOk) return false

  const missingPhotoKeys = getMissingCashProcedurePhotoFieldKeys({
    packed: answer.inputValue ?? null,
    fields: fields.map((field) => ({
      key: field.key,
      isRequired: field.isRequired,
      isPhotoRequired: field.isPhotoRequired,
    })),
    photosRaw: answer.cashPhotosJson,
  })
  return missingPhotoKeys.length === 0
}

const matchesSourceSelection = (answer: CashAnswerRow, selection: FindWorkdayCashSourceSelection | undefined) => {
  const mode = selection?.mode ?? "non_empty"
  if (mode === "first") return true
  if (mode === "non_empty") return hasMeaningfulCashAnswerData(answer)
  return isCompleteCashAnswerForStage(answer, selection?.fieldsByWhen)
}

export async function findWorkdayCashSourceAnswers(
  db: CashSourceDb,
  input: FindWorkdayCashSourceAnswersInput,
): Promise<Record<ProcedureWhen, WorkdayCashSourceAnswer | null>> {
  const whens = input.whens?.length ? input.whens : (["OPEN", "CLOSE"] as ProcedureWhen[])

  const answers = await db.workIntervalProcedureAnswer.findMany({
    where: {
      type: "CASH",
      when: { in: whens },
      workInterval: {
        workdayId: input.workdayId,
      },
    },
    select: {
      id: true,
      workIntervalId: true,
      when: true,
      inputValue: true,
      cashPhotosJson: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  }) as CashAnswerRow[]

  const byWhen: Record<ProcedureWhen, WorkdayCashSourceAnswer | null> = {
    OPEN: null,
    CLOSE: null,
  }

  for (const answer of answers) {
    if (byWhen[answer.when]) continue
    if (!matchesSourceSelection(answer, input.selection)) continue

    byWhen[answer.when] = {
      answerId: answer.id,
      workIntervalId: answer.workIntervalId,
      when: answer.when,
      inputValue: (answer.inputValue ?? "").trim(),
      cashPhotosJson: answer.cashPhotosJson as Prisma.JsonValue | null,
      createdAt: answer.createdAt,
      updatedAt: answer.updatedAt,
    }
  }

  return byWhen
}

export async function findWorkdayCashSourceAnswer(
  db: CashSourceDb,
  input: FindWorkdayCashSourceAnswerInput,
) {
  const byWhen = await findWorkdayCashSourceAnswers(db, {
    workdayId: input.workdayId,
    whens: [input.when],
    selection: input.selectionMode
      ? {
          mode: input.selectionMode,
          fieldsByWhen: input.fields ? { [input.when]: input.fields } : undefined,
        }
      : undefined,
  })
  return byWhen[input.when]
}
