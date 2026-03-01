import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg } from "@/lib/auth"

const querySchema = z.object({
  locationId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const getLatestDate = (values: Date[]) => {
  if (values.length === 0) return null
  return values.reduce((latest, value) => (value.getTime() > latest.getTime() ? value : latest))
}

export async function GET(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    locationId: url.searchParams.get("locationId") ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { locationId, dateFrom, dateTo } = parsed.data

  const workdayWhere: {
    organizationId: string
    locationId?: string
    workDate?: { gte?: Date; lte?: Date }
  } = {
    organizationId: session.organization.id,
  }

  if (locationId) {
    workdayWhere.locationId = locationId
  }

  if (dateFrom || dateTo) {
    workdayWhere.workDate = {}
    if (dateFrom) {
      workdayWhere.workDate.gte = new Date(dateFrom)
    }
    if (dateTo) {
      workdayWhere.workDate.lte = new Date(dateTo)
    }
  }

  const workdays = await prisma.workday.findMany({
    where: workdayWhere,
    select: {
      id: true,
      updatedAt: true,
    },
  })

  const workdayIds = workdays.map((workday) => workday.id)
  const workdaysUpdatedAt = getLatestDate(workdays.map((workday) => workday.updatedAt))

  const intervalAggregate =
    workdayIds.length === 0
      ? null
      : await prisma.workInterval.aggregate({
          where: {
            workdayId: {
              in: workdayIds,
            },
          },
          _count: {
            _all: true,
          },
          _max: {
            updatedAt: true,
          },
        })

  const intervalCount = intervalAggregate?._count._all ?? 0
  const intervalsUpdatedAt = intervalAggregate?._max.updatedAt ?? null
  const signature = [
    String(workdayIds.length),
    String(intervalCount),
    workdaysUpdatedAt?.toISOString() ?? "0",
    intervalsUpdatedAt?.toISOString() ?? "0",
  ].join("|")

  return NextResponse.json(
    {
      data: {
        signature,
        workdayCount: workdayIds.length,
        intervalCount,
        workdaysUpdatedAt: workdaysUpdatedAt?.toISOString() ?? null,
        intervalsUpdatedAt: intervalsUpdatedAt?.toISOString() ?? null,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
