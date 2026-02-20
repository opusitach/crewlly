import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg } from "@/lib/auth"

export async function GET(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const typesParam = url.searchParams.get("types")
  const limitParam = url.searchParams.get("limit")

  const types =
    typeof typesParam === "string" && typesParam.trim().length > 0
      ? typesParam
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : []

  const limitParsed = Number(limitParam)
  const limit =
    Number.isInteger(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 100) : undefined

  const notifications = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      organizationId: session.organization.id,
      ...(status ? { status } : {}),
      ...(types.length > 0 ? { type: { in: types } } : {}),
    },
    orderBy: { createdAt: "desc" },
    ...(limit ? { take: limit } : {}),
  })

  return NextResponse.json(
    {
      data: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        status: notification.status,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}

export async function PATCH() {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      organizationId: session.organization.id,
      status: "unread",
    },
    data: { status: "read", readAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
