import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, isOwnerOrManagerRole } from "@/lib/auth"

type RouteContext = { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().uuid("Некорректный id рабочего дня"),
})

const toResponseData = (workday: { id: string; status: string; publishedAt: Date | null }) => ({
  id: workday.id,
  status: workday.status,
  publishedAt: workday.publishedAt?.toISOString() ?? null,
})

export async function POST(_request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization || !session.membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isOwnerOrManagerRole(session.membership)) {
    return NextResponse.json({ error: "Недостаточно прав для публикации дня" }, { status: 403 })
  }

  const params = paramsSchema.safeParse(await context.params)
  if (!params.success) {
    return NextResponse.json({ error: params.error.flatten() }, { status: 400 })
  }

  try {
    const existing = await prisma.workday.findFirst({
      where: {
        id: params.data.id,
        organizationId: session.organization.id,
      },
      select: {
        id: true,
        status: true,
        publishedAt: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Рабочий день не найден" }, { status: 404 })
    }

    if (existing.status === "published") {
      return NextResponse.json({ data: toResponseData(existing) })
    }

    const published = await prisma.workday.update({
      where: { id: existing.id },
      data: {
        status: "published",
        publishedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        publishedAt: true,
      },
    })

    return NextResponse.json({ data: toResponseData(published) })
  } catch (error) {
    console.error("[api/workdays/[id]/publish]", error)
    return NextResponse.json(
      {
        error: "Не удалось отметить рабочий день как проверенный",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
