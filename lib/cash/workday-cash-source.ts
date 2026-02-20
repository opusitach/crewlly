import { Prisma, ProcedureWhen } from "@prisma/client"

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

export async function findWorkdayCashSourceAnswers(
  db: CashSourceDb,
  input: { workdayId: string; whens?: ProcedureWhen[] },
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
  })

  const byWhen: Record<ProcedureWhen, WorkdayCashSourceAnswer | null> = {
    OPEN: null,
    CLOSE: null,
  }

  for (const answer of answers) {
    if (byWhen[answer.when]) continue

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
  input: { workdayId: string; when: ProcedureWhen },
) {
  const byWhen = await findWorkdayCashSourceAnswers(db, {
    workdayId: input.workdayId,
    whens: [input.when],
  })
  return byWhen[input.when]
}
