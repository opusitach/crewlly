import type { Prisma, PrismaClient } from "@prisma/client"

// Accept either the root client or a transaction client.
type Client = PrismaClient | Prisma.TransactionClient

export const HANDOFF_NOTE_MAX_LENGTH = 500

export type UpsertHandoffNoteInput = {
  authorIntervalId: string
  locationId: string
  authorEmployeeId: string
  authorUserId?: string | null
  text: string
  authorClosedAt: Date
}

export async function upsertHandoffNote(client: Client, input: UpsertHandoffNoteInput) {
  const trimmed = (input.text ?? "").trim()
  if (!trimmed) return null
  const truncated = trimmed.slice(0, HANDOFF_NOTE_MAX_LENGTH)

  return client.shiftHandoffNote.upsert({
    where: { authorIntervalId: input.authorIntervalId },
    create: {
      authorIntervalId: input.authorIntervalId,
      locationId: input.locationId,
      authorEmployeeId: input.authorEmployeeId,
      authorUserId: input.authorUserId ?? null,
      text: truncated,
      authorClosedAt: input.authorClosedAt,
    },
    update: {
      text: truncated,
      authorClosedAt: input.authorClosedAt,
    },
  })
}

export type HandoffNoteForRecipient = {
  id: string
  text: string
  authorClosedAt: Date
  authorEmployeeId: string
  authorFullName: string | null
}

export type ResolveHandoffNotesInput = {
  intervalId: string
  locationId: string
  intervalStartAt: Date
}

/**
 * Returns handoff notes that should be displayed to the recipient interval.
 *
 * Wave rule: the interval belongs to a note's target wave iff
 *   intervalStartAt == min(startAt) over non-canceled work_intervals in the same location
 *   whose startAt >= note.authorClosedAt and whose id != note.authorIntervalId.
 *
 * Excludes notes already delivered/acknowledged to this interval.
 */
export async function resolvePendingHandoffNotesForInterval(
  client: Client,
  input: ResolveHandoffNotesInput,
): Promise<HandoffNoteForRecipient[]> {
  const candidates = await client.shiftHandoffNote.findMany({
    where: {
      locationId: input.locationId,
      authorClosedAt: { lte: input.intervalStartAt },
      authorIntervalId: { not: input.intervalId },
      deliveries: { none: { workIntervalId: input.intervalId } },
    },
    orderBy: { authorClosedAt: "asc" },
    include: {
      authorEmployee: {
        select: { user: { select: { fullName: true } } },
      },
    },
  })

  if (candidates.length === 0) return []

  const waveMatches: HandoffNoteForRecipient[] = []
  for (const note of candidates) {
    const earliest = await client.workInterval.findFirst({
      where: {
        workday: { locationId: note.locationId },
        startAt: { gte: note.authorClosedAt },
        status: { not: "canceled" },
        id: { not: note.authorIntervalId },
      },
      orderBy: { startAt: "asc" },
      select: { startAt: true },
    })
    if (!earliest) continue
    if (earliest.startAt.getTime() !== input.intervalStartAt.getTime()) continue

    waveMatches.push({
      id: note.id,
      text: note.text,
      authorClosedAt: note.authorClosedAt,
      authorEmployeeId: note.authorEmployeeId,
      authorFullName: note.authorEmployee?.user?.fullName ?? null,
    })
  }

  return waveMatches
}

export async function acknowledgeHandoffNotes(
  client: Client,
  input: { noteIds: string[]; workIntervalId: string },
): Promise<number> {
  if (input.noteIds.length === 0) return 0
  const result = await client.shiftHandoffNoteDelivery.createMany({
    data: input.noteIds.map((noteId) => ({
      handoffNoteId: noteId,
      workIntervalId: input.workIntervalId,
    })),
    skipDuplicates: true,
  })
  return result.count
}
