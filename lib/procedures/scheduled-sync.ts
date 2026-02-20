import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getRuleTemplatesForPositionAndDate } from "@/lib/procedures/templates"
import { ensureProceduresForInterval } from "@/lib/procedures/snapshots"

export async function syncScheduledProceduresForPosition(positionId: string) {
  if (!positionId) return

  try {
    await prisma.$transaction(async (tx) => {
      const scheduledIntervals = await tx.workInterval.findMany({
        where: {
          positionId,
          status: "scheduled",
        },
        select: {
          id: true,
          workday: {
            select: {
              workDate: true,
            },
          },
        },
        orderBy: {
          startAt: "asc",
        },
      })

      for (const interval of scheduledIntervals) {
        const templatesByWhen = await getRuleTemplatesForPositionAndDate(
          tx,
          positionId,
          interval.workday.workDate,
        )
        await ensureProceduresForInterval(tx, interval.id, templatesByWhen, true)
      }
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return
    }
    throw error
  }
}
