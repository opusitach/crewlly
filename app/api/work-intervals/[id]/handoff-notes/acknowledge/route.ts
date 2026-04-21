import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import {
  acknowledgeHandoffNotes,
  resolvePendingHandoffNotesForInterval,
} from "@/lib/work-intervals/handoff-notes"

type RouteContext = { params: Promise<{ id: string }> }

const ackSchema = z.object({
  noteIds: z.array(z.string().uuid()).min(1).max(50),
})

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params
  const { interval, error, status } = await getAuthorizedInterval(id)
  if (error || !interval) {
    return NextResponse.json({ error }, { status })
  }

  const json = await request.json().catch(() => ({}))
  const parsed = ackSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const eligible = await resolvePendingHandoffNotesForInterval(prisma, {
      intervalId: interval.id,
      locationId: interval.workday.locationId,
      intervalStartAt: interval.startAt,
    })
    const eligibleIds = new Set(eligible.map((note) => note.id))
    const toAck = parsed.data.noteIds.filter((noteId) => eligibleIds.has(noteId))

    const count = await acknowledgeHandoffNotes(prisma, {
      noteIds: toAck,
      workIntervalId: interval.id,
    })

    return NextResponse.json({ data: { acknowledged: count } })
  } catch (err) {
    console.error("[api/work-intervals/handoff-notes/acknowledge]", err)
    return NextResponse.json({ error: "Не удалось подтвердить комментарии." }, { status: 500 })
  }
}
