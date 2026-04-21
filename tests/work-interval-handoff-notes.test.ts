import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  acknowledgeHandoffNotes,
  resolvePendingHandoffNotesForInterval,
  upsertHandoffNote,
} from "../lib/work-intervals/handoff-notes"

type MockClient = {
  shiftHandoffNote: {
    upsert: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  shiftHandoffNoteDelivery: {
    createMany: ReturnType<typeof vi.fn>
  }
  workInterval: {
    findFirst: ReturnType<typeof vi.fn>
  }
}

const makeClient = (): MockClient => ({
  shiftHandoffNote: {
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
  shiftHandoffNoteDelivery: {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  workInterval: {
    findFirst: vi.fn(),
  },
})

describe("upsertHandoffNote", () => {
  let client: MockClient
  beforeEach(() => {
    client = makeClient()
  })

  it("skips upsert when text is empty or whitespace", async () => {
    const result = await upsertHandoffNote(client as any, {
      authorIntervalId: "i1",
      locationId: "loc",
      authorEmployeeId: "emp",
      text: "   ",
      authorClosedAt: new Date(),
    })
    expect(result).toBeNull()
    expect(client.shiftHandoffNote.upsert).not.toHaveBeenCalled()
  })

  it("upserts by authorIntervalId so a second close call updates rather than duplicates", async () => {
    client.shiftHandoffNote.upsert.mockResolvedValue({ id: "note-1" })
    await upsertHandoffNote(client as any, {
      authorIntervalId: "i1",
      locationId: "loc",
      authorEmployeeId: "emp",
      authorUserId: "u1",
      text: " handoff ",
      authorClosedAt: new Date("2026-05-01T12:00:00.000Z"),
    })
    expect(client.shiftHandoffNote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorIntervalId: "i1" },
        create: expect.objectContaining({ text: "handoff" }),
        update: expect.objectContaining({ text: "handoff" }),
      }),
    )
  })

  it("truncates text over 500 chars", async () => {
    const long = "a".repeat(700)
    client.shiftHandoffNote.upsert.mockResolvedValue({ id: "note-1" })
    await upsertHandoffNote(client as any, {
      authorIntervalId: "i1",
      locationId: "loc",
      authorEmployeeId: "emp",
      text: long,
      authorClosedAt: new Date(),
    })
    const call = client.shiftHandoffNote.upsert.mock.calls[0][0]
    expect(call.create.text.length).toBe(500)
  })
})

describe("resolvePendingHandoffNotesForInterval (wave matching)", () => {
  let client: MockClient
  const intervalId = "recipient-interval"
  const locationId = "loc-1"
  const closedAt = new Date("2026-05-01T12:00:00.000Z")

  beforeEach(() => {
    client = makeClient()
  })

  it("returns the note when the recipient interval's startAt is the minimum startAt >= authorClosedAt", async () => {
    client.shiftHandoffNote.findMany.mockResolvedValue([
      {
        id: "note-1",
        text: "heads up",
        authorIntervalId: "author-1",
        authorClosedAt: closedAt,
        authorEmployeeId: "emp-a",
        authorEmployee: { user: { fullName: "Alice" } },
      },
    ])
    client.workInterval.findFirst.mockResolvedValue({
      startAt: new Date("2026-05-01T14:00:00.000Z"),
    })

    const notes = await resolvePendingHandoffNotesForInterval(client as any, {
      intervalId,
      locationId,
      intervalStartAt: new Date("2026-05-01T14:00:00.000Z"),
    })

    expect(notes).toHaveLength(1)
    expect(notes[0].id).toBe("note-1")
    expect(notes[0].authorFullName).toBe("Alice")
  })

  it("does NOT return the note when another interval has an earlier startAt in the same window", async () => {
    client.shiftHandoffNote.findMany.mockResolvedValue([
      {
        id: "note-1",
        text: "heads up",
        authorIntervalId: "author-1",
        authorClosedAt: closedAt,
        authorEmployeeId: "emp-a",
        authorEmployee: { user: { fullName: "Alice" } },
      },
    ])
    // min startAt in the window is 14:00, but this recipient starts at 16:00 — not in the wave
    client.workInterval.findFirst.mockResolvedValue({
      startAt: new Date("2026-05-01T14:00:00.000Z"),
    })

    const notes = await resolvePendingHandoffNotesForInterval(client as any, {
      intervalId,
      locationId,
      intervalStartAt: new Date("2026-05-01T16:00:00.000Z"),
    })

    expect(notes).toHaveLength(0)
  })

  it("returns the note to BOTH intervals when two share the earliest startAt", async () => {
    client.shiftHandoffNote.findMany.mockResolvedValue([
      {
        id: "note-1",
        text: "heads up",
        authorIntervalId: "author-1",
        authorClosedAt: closedAt,
        authorEmployeeId: "emp-a",
        authorEmployee: { user: { fullName: "Alice" } },
      },
    ])
    // both recipients have startAt == 14:00, which is also the minimum
    client.workInterval.findFirst.mockResolvedValue({
      startAt: new Date("2026-05-01T14:00:00.000Z"),
    })

    const intervalA = await resolvePendingHandoffNotesForInterval(client as any, {
      intervalId: "recipient-a",
      locationId,
      intervalStartAt: new Date("2026-05-01T14:00:00.000Z"),
    })
    const intervalB = await resolvePendingHandoffNotesForInterval(client as any, {
      intervalId: "recipient-b",
      locationId,
      intervalStartAt: new Date("2026-05-01T14:00:00.000Z"),
    })

    expect(intervalA).toHaveLength(1)
    expect(intervalB).toHaveLength(1)
  })

  it("filters out notes already acknowledged by this interval (via findMany where-clause)", async () => {
    client.shiftHandoffNote.findMany.mockResolvedValue([])

    const notes = await resolvePendingHandoffNotesForInterval(client as any, {
      intervalId,
      locationId,
      intervalStartAt: new Date("2026-05-01T14:00:00.000Z"),
    })

    expect(notes).toHaveLength(0)
    const whereArg = client.shiftHandoffNote.findMany.mock.calls[0][0].where
    expect(whereArg.deliveries).toEqual({ none: { workIntervalId: intervalId } })
    expect(whereArg.authorIntervalId).toEqual({ not: intervalId })
  })

  it("skips notes with no candidate intervals in the window (empty location, all canceled)", async () => {
    client.shiftHandoffNote.findMany.mockResolvedValue([
      {
        id: "note-orphan",
        text: "no one will read this",
        authorIntervalId: "author-1",
        authorClosedAt: closedAt,
        authorEmployeeId: "emp-a",
        authorEmployee: { user: { fullName: "Alice" } },
      },
    ])
    client.workInterval.findFirst.mockResolvedValue(null)

    const notes = await resolvePendingHandoffNotesForInterval(client as any, {
      intervalId,
      locationId,
      intervalStartAt: new Date("2026-05-01T14:00:00.000Z"),
    })

    expect(notes).toHaveLength(0)
  })
})

describe("acknowledgeHandoffNotes", () => {
  it("writes deliveries with skipDuplicates so a second ack is idempotent", async () => {
    const client = makeClient()
    client.shiftHandoffNoteDelivery.createMany.mockResolvedValue({ count: 2 })

    const count = await acknowledgeHandoffNotes(client as any, {
      noteIds: ["note-1", "note-2"],
      workIntervalId: "interval-1",
    })

    expect(count).toBe(2)
    expect(client.shiftHandoffNoteDelivery.createMany).toHaveBeenCalledWith({
      data: [
        { handoffNoteId: "note-1", workIntervalId: "interval-1" },
        { handoffNoteId: "note-2", workIntervalId: "interval-1" },
      ],
      skipDuplicates: true,
    })
  })

  it("is a no-op for an empty note list", async () => {
    const client = makeClient()
    const count = await acknowledgeHandoffNotes(client as any, {
      noteIds: [],
      workIntervalId: "interval-1",
    })
    expect(count).toBe(0)
    expect(client.shiftHandoffNoteDelivery.createMany).not.toHaveBeenCalled()
  })
})
