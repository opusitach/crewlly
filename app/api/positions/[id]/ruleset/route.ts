import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, isOwnerRole } from "@/lib/auth"
import { getRuleTemplatesForPositionAndDate } from "@/lib/procedures/templates"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isOwnerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: positionId } = await context.params
  const position = await prisma.position.findUnique({ where: { id: positionId } })
  if (!position || position.organizationId !== session.organization.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const url = new URL(request.url)
  const dateParam = url.searchParams.get("date")
  if (!dateParam) {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 })
  }

  const date = new Date(dateParam)
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 })
  }

  const templates = await getRuleTemplatesForPositionAndDate(prisma, positionId, date)
  return NextResponse.json({
    data: {
      positionId,
      date: dateParam,
      rules: {
        OPEN: templates.OPEN,
        CLOSE: templates.CLOSE,
      },
    },
  })
}
