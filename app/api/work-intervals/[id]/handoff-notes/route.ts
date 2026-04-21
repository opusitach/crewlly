import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import {
  HANDOFF_NOTE_MAX_LENGTH,
  resolvePendingHandoffNotesForInterval,
  upsertHandoffNote,
} from "@/lib/work-intervals/handoff-notes"
import { isClosedStatus } from "@/lib/procedures/status"

type RouteContext = { params: Promise<{ id: string }> }

const createSchema = z.object({
  text: z.string().trim().min(1).max(HANDOFF_NOTE_MAX_LENGTH),
})

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const { interval, error, status } = await getAuthorizedInterval(id)
  if (error || !interval) {
    return NextResponse.json({ error }, { status })
  }

  try {
    const notes = await resolvePendingHandoffNotesForInterval(prisma, {
      intervalId: interval.id,
      locationId: interval.workday.locationId,
      intervalStartAt: interval.startAt,
    })

    return NextResponse.json({
      data: {
        notes: notes.map((note) => ({
          id: note.id,
          text: note.text,
          authorClosedAt: note.authorClosedAt.toISOString(),
          authorFullName: note.authorFullName,
        })),
      },
    })
  } catch (err) {
    console.error("[api/work-intervals/handoff-notes]", err)
    return NextResponse.json({ error: "Не удалось загрузить комментарии предыдущей смены." }, { status: 500 })
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params
  const { session, interval, effectiveStatus, effectiveClosedAt, error, status } = await getAuthorizedInterval(id)
  if (error || !interval) {
    return NextResponse.json({ error }, { status })
  }

  const resolvedStatus = effectiveStatus ?? interval.status
  const resolvedClosedAt = effectiveClosedAt ?? interval.closedAt ?? interval.timeEntry?.clockOutAt ?? null
  if (!isClosedStatus(resolvedStatus) || !resolvedClosedAt) {
    return NextResponse.json({ error: "Комментарий можно оставить только после закрытия смены." }, { status: 409 })
  }

  const json = await request.json().catch(() => ({}))
  const parsed = createSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const note = await upsertHandoffNote(prisma, {
      authorIntervalId: interval.id,
      locationId: interval.workday.locationId,
      authorEmployeeId: interval.employeeId,
      authorUserId: session?.user.id ?? null,
      text: parsed.data.text,
      authorClosedAt: resolvedClosedAt,
    })
    return NextResponse.json({ data: { id: note?.id ?? null } })
  } catch (err) {
    console.error("[api/work-intervals/handoff-notes POST]", err)
    return NextResponse.json({ error: "Не удалось сохранить комментарий." }, { status: 500 })
  }
}
