import { Prisma } from "@prisma/client"

type TransactionClient = Prisma.TransactionClient

type ClockInPayload = {
  employeeId: string
  clockInAt: Date
  photoUrl?: string | null
  lat?: number | null
  lng?: number | null
}

type FinalizeWorkIntervalOpenInput = {
  intervalId: string
  openedAt: Date
  openedByOwnerId?: string | null
  openOverrideReason?: string | null
  clockIn?: ClockInPayload | null
}

export async function finalizeWorkIntervalOpen(tx: TransactionClient, input: FinalizeWorkIntervalOpenInput) {
  if (input.clockIn) {
    await tx.timeEntry.upsert({
      where: { workIntervalId: input.intervalId },
      create: {
        workIntervalId: input.intervalId,
        employeeId: input.clockIn.employeeId,
        clockInAt: input.clockIn.clockInAt,
        clockInPhotoUrl: input.clockIn.photoUrl ?? null,
        clockInLat: input.clockIn.lat ?? null,
        clockInLng: input.clockIn.lng ?? null,
      },
      update: {
        clockInAt: input.clockIn.clockInAt,
        clockInPhotoUrl: input.clockIn.photoUrl ?? null,
        clockInLat: input.clockIn.lat ?? null,
        clockInLng: input.clockIn.lng ?? null,
        clockOutAt: null,
        clockOutPhotoUrl: null,
        clockOutLat: null,
        clockOutLng: null,
      },
    })
  }

  return tx.workInterval.update({
    where: { id: input.intervalId },
    data: {
      status: "in_progress",
      openedAt: input.openedAt,
      closedAt: null,
      openedByOwnerId: input.openedByOwnerId ?? null,
      openOverrideReason: input.openOverrideReason ?? null,
      closedByOwnerId: null,
      closeOverrideReason: null,
    },
  })
}
