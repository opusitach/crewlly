import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext } from "@/lib/cash/access"
import { getCashSessionForOrganization } from "@/lib/cash/session-service"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await context.params
  const data = await prisma.$transaction((tx) =>
    getCashSessionForOrganization(tx, {
      sessionId: id,
      organizationId: auth.organizationId,
    }),
  )

  if (!data) {
    return NextResponse.json({ error: "Кассовая сессия не найдена" }, { status: 404 })
  }

  return NextResponse.json({ data })
}
