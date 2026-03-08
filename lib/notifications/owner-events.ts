import { Prisma } from "@prisma/client"

type OwnerNotificationType = "shift" | "cash"

type NotifyOrganizationOwnersInput = {
  organizationId: string
  type: OwnerNotificationType
  title: string
  message: string
  payload?: unknown
  excludeUserId?: string | null
}

export async function notifyOrganizationOwners(
  tx: Prisma.TransactionClient,
  input: NotifyOrganizationOwnersInput,
): Promise<number> {
  const ownerMembers = await tx.organizationMember.findMany({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      OR: [{ accessRole: { is: { key: "owner" } } }, { legacyRole: "owner" }],
    },
    select: {
      userId: true,
    },
  })

  const recipientIds = Array.from(new Set(ownerMembers.map((member) => member.userId))).filter(
    (userId) => userId && userId !== input.excludeUserId,
  )

  if (recipientIds.length === 0) return 0

  const result = await tx.notification.createMany({
    data: recipientIds.map((userId) => ({
      organizationId: input.organizationId,
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      status: "unread",
    })),
  })

  return result.count
}

export function toEventActorName(input: { fullName?: string | null; email?: string | null }, fallback = "Сотрудник") {
  const fullName = input.fullName?.trim()
  if (fullName) return fullName
  const email = input.email?.trim()
  if (email) return email
  return fallback
}

export function toEventDateLabel(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("ru-RU")
}
