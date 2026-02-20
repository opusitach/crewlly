import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg } from "@/lib/auth"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(_request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await context.params

  const notification = await prisma.notification.findFirst({
    where: {
      id,
      userId: session.user.id,
      organizationId: session.organization.id,
    },
  })

  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { status: "read", readAt: new Date() },
  })

  return NextResponse.json({
    data: {
      id: updated.id,
      status: updated.status,
      readAt: updated.readAt?.toISOString() ?? null,
    },
  })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await context.params

  const notification = await prisma.notification.findFirst({
    where: {
      id,
      userId: session.user.id,
      organizationId: session.organization.id,
    },
  })

  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.notification.delete({ where: { id: notification.id } })

  return NextResponse.json({ success: true })
}
