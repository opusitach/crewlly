import { Prisma } from "@prisma/client"
import { normalizeCashProcedurePhotoMap } from "./procedure-values"

type CashPhotoDb = Pick<Prisma.TransactionClient, "workIntervalProcedureAnswer">

export type CashSessionFieldPhoto = {
  id: string
  answerId: string
  sourceWorkIntervalId: string
  fieldKey: string
  inputStage: "open" | "close"
  photoS3Key: string | null
  photoUrl: string | null
}

export async function listWorkdayCashFieldPhotos(
  db: CashPhotoDb,
  input: {
    workdayIds: string[]
    allowedFieldKeysByWorkday?: Record<string, Set<string>>
  },
): Promise<Record<string, CashSessionFieldPhoto[]>> {
  const workdayIds = Array.from(new Set(input.workdayIds.filter((id) => typeof id === "string" && id.length > 0)))
  if (workdayIds.length === 0) {
    return {}
  }

  const answers = await db.workIntervalProcedureAnswer.findMany({
    where: {
      type: "CASH",
      when: { in: ["OPEN", "CLOSE"] },
      workInterval: {
        workdayId: { in: workdayIds },
      },
    },
    select: {
      id: true,
      when: true,
      workIntervalId: true,
      cashPhotosJson: true,
      createdAt: true,
      workInterval: {
        select: {
          workdayId: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const sourceByWorkdayAndWhen = new Map<string, (typeof answers)[number]>()
  for (const answer of answers) {
    const key = `${answer.workInterval.workdayId}:${answer.when}`
    if (sourceByWorkdayAndWhen.has(key)) continue
    sourceByWorkdayAndWhen.set(key, answer)
  }

  const byWorkday: Record<string, CashSessionFieldPhoto[]> = {}
  for (const answer of sourceByWorkdayAndWhen.values()) {
    const workdayId = answer.workInterval.workdayId
    const allowedKeys = input.allowedFieldKeysByWorkday?.[workdayId]
    const normalizedPhotos = normalizeCashProcedurePhotoMap(answer.cashPhotosJson, allowedKeys)
    const inputStage = answer.when === "OPEN" ? "open" : "close"

    for (const [fieldKey, photo] of Object.entries(normalizedPhotos)) {
      if (!photo.photoS3Key && !photo.photoUrl) continue

      const list = byWorkday[workdayId] ?? []
      list.push({
        id: `${answer.id}:${fieldKey}`,
        answerId: answer.id,
        sourceWorkIntervalId: answer.workIntervalId,
        fieldKey,
        inputStage,
        photoS3Key: photo.photoS3Key,
        photoUrl: photo.photoUrl,
      })
      byWorkday[workdayId] = list
    }
  }

  for (const workdayId of Object.keys(byWorkday)) {
    byWorkday[workdayId].sort((a, b) => {
      if (a.inputStage !== b.inputStage) return a.inputStage === "open" ? -1 : 1
      return a.fieldKey.localeCompare(b.fieldKey)
    })
  }

  return byWorkday
}
