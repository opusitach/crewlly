import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deleteObjectByKey } from "@/lib/s3"
import { isAuthorizedInternalCronRequest } from "@/lib/internal-cron"

const RETENTION_DAYS = 14
const BATCH_LIMIT = 200

export async function POST(request: Request) {
  if (!isAuthorizedInternalCronRequest(request, ["INTERNAL_CRON_SECRET", "MEDIA_RETENTION_CRON_SECRET"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const candidates = await prisma.workIntervalProcedureAnswer.findMany({
    where: {
      photoS3Key: { not: null },
      photoDeletedAt: null,
      workInterval: {
        OR: [
          {
            status: "completed",
            closedAt: { not: null, lte: cutoff },
          },
          {
            status: "canceled",
            updatedAt: { lte: cutoff },
          },
        ],
      },
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH_LIMIT,
    select: {
      id: true,
      photoS3Key: true,
    },
  })

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      scanned: 0,
      deleted: 0,
      failed: 0,
      retentionDays: RETENTION_DAYS,
    })
  }

  const deletedIds: string[] = []
  const failed: Array<{ id: string; key: string; error: string }> = []

  for (const answer of candidates) {
    const key = answer.photoS3Key
    if (!key) continue

    try {
      await deleteObjectByKey(key)
      deletedIds.push(answer.id)
    } catch (error) {
      failed.push({
        id: answer.id,
        key,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (deletedIds.length > 0) {
    await prisma.workIntervalProcedureAnswer.updateMany({
      where: { id: { in: deletedIds } },
      data: {
        photoS3Key: null,
        photoUrl: null,
        photoDeletedAt: new Date(),
      },
    })
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    deleted: deletedIds.length,
    failed: failed.length,
    failures: failed,
    retentionDays: RETENTION_DAYS,
    nextAction: candidates.length === BATCH_LIMIT ? "run_again" : "idle",
  })
}
