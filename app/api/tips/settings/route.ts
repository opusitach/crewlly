import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext, resolveOrganizationLocationId } from "@/lib/cash/access"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"

const tipsMethodSchema = z.enum(["equal", "by_hours"])

const putPayloadSchema = z.object({
  locationId: z.string().uuid().optional(),
  splitMethod: tipsMethodSchema,
})

function normalizeSplitMethod(raw: string | null | undefined): z.infer<typeof tipsMethodSchema> {
  return raw === "by_hours" ? "by_hours" : "equal"
}

export async function GET(request: Request) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const requestedLocationId = url.searchParams.get("locationId")
  const locationResult = await resolveOrganizationLocationId(auth.organizationId, requestedLocationId)
  if (!locationResult.ok) {
    return NextResponse.json({ error: locationResult.error }, { status: locationResult.status })
  }

  const location = await prisma.location.findUnique({
    where: { id: locationResult.locationId },
    select: { id: true, tipsSplitMethod: true },
  })

  if (!location) {
    return NextResponse.json({ error: "Локация не найдена" }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      locationId: location.id,
      splitMethod: normalizeSplitMethod(location.tipsSplitMethod),
    },
  })
}

export async function PUT(request: Request) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!auth.isOwner) {
    return NextResponse.json({ error: "Только владелец может менять метод распределения чаевых" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = putPayloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const locationResult = await resolveOrganizationLocationId(auth.organizationId, parsed.data.locationId)
  if (!locationResult.ok) {
    return NextResponse.json({ error: locationResult.error }, { status: locationResult.status })
  }

  const splitMethod = normalizeSplitMethod(parsed.data.splitMethod)

  const result = await prisma.$transaction(async (tx) => {
    await tx.location.update({
      where: { id: locationResult.locationId },
      data: { tipsSplitMethod: splitMethod },
    })

    const draftWorkdays = await tx.workday.findMany({
      where: {
        locationId: locationResult.locationId,
        status: "draft",
        OR: [
          {
            cashSessions: {
              some: {
                status: { in: ["closed", "reviewed"] },
              },
            },
          },
          {
            workIntervals: {
              some: {
                status: { in: ["in_progress", "completed"] },
              },
            },
          },
        ],
      },
      select: { id: true },
    })

    for (const workday of draftWorkdays) {
      await syncWorkdayTipsFromCashSessions(tx, {
        workdayId: workday.id,
        locationId: locationResult.locationId,
      })
    }

    return {
      locationId: locationResult.locationId,
      splitMethod,
      recalculatedDraftWorkdays: draftWorkdays.length,
    }
  })

  return NextResponse.json({ data: result })
}
