import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, hasOrganizationActionAccess } from "@/lib/auth"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

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
  const request = _request
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization || !session.membership) {
    logAuditEvent(request, {
      event_type: "workday.publish",
      outcome: "denied",
      status: 401,
      route: "/api/workdays/[id]/publish",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canPublishWorkday = await hasOrganizationActionAccess(session, {
    permission: "workday:publish",
    allowManagementRole: true,
  })
  if (!canPublishWorkday) {
    logAuditEvent(request, {
      event_type: "workday.publish",
      outcome: "denied",
      status: 403,
      route: "/api/workdays/[id]/publish",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "missing_workday_publish_permission",
    })
    return NextResponse.json({ error: "Недостаточно прав для публикации дня" }, { status: 403 })
  }

  const params = paramsSchema.safeParse(await context.params)
  if (!params.success) {
    logAuditEvent(request, {
      event_type: "workday.publish",
      outcome: "failure",
      status: 400,
      route: "/api/workdays/[id]/publish",
      actor: auditActorFromSession(session),
      reason: "validation_error",
    })
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
      logAuditEvent(request, {
        event_type: "workday.publish",
        outcome: "failure",
        status: 404,
        route: "/api/workdays/[id]/publish",
        actor: auditActorFromSession(session),
        target: {
          type: "workday",
          id: params.data.id,
          organization_id: session.organization.id,
          workday_id: params.data.id,
        },
        reason: "workday_not_found",
      })
      return NextResponse.json({ error: "Рабочий день не найден" }, { status: 404 })
    }

    if (existing.status === "published") {
      logAuditEvent(request, {
        event_type: "workday.publish",
        outcome: "success",
        status: 200,
        route: "/api/workdays/[id]/publish",
        actor: auditActorFromSession(session),
        target: {
          type: "workday",
          id: existing.id,
          organization_id: session.organization.id,
          workday_id: existing.id,
        },
        metadata: {
          already_published: true,
        },
      })
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

    logAuditEvent(request, {
      event_type: "workday.publish",
      outcome: "success",
      status: 200,
      route: "/api/workdays/[id]/publish",
      actor: auditActorFromSession(session),
      target: {
        type: "workday",
        id: published.id,
        organization_id: session.organization.id,
        workday_id: published.id,
      },
      metadata: {
        already_published: false,
      },
    })
    return NextResponse.json({ data: toResponseData(published) })
  } catch (error) {
    console.error("[api/workdays/[id]/publish]", error)
    logAuditEvent(request, {
      event_type: "workday.publish",
      outcome: "failure",
      status: 500,
      route: "/api/workdays/[id]/publish",
      actor: auditActorFromSession(session),
      reason: "server_error",
    })
    return NextResponse.json(
      {
        error: "Не удалось отметить рабочий день как проверенный",
      },
      { status: 500 },
    )
  }
}
