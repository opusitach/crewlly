import { Prisma } from "@prisma/client"
import { isCashInputStage, type CashFieldConfig, type CashSessionFieldSnapshot } from "@/lib/cash/module"
import { listWorkdayCashFieldPhotos } from "@/lib/cash/session-field-photos"

export async function getCashSessionForOrganization(
  tx: Prisma.TransactionClient,
  input: { sessionId: string; organizationId: string },
) {
  const session = await tx.cashSession.findUnique({
    where: { id: input.sessionId },
    include: {
      cashRegister: {
        select: {
          id: true,
          name: true,
          locationId: true,
          location: {
            select: {
              organizationId: true,
            },
          },
        },
      },
      workday: {
        select: {
          id: true,
          status: true,
          locationId: true,
          workDate: true,
        },
      },
      closedByEmployee: {
        select: {
          id: true,
          user: {
            select: {
              fullName: true,
            },
          },
        },
      },
      fieldValues: {
        orderBy: [{ inputStage: "asc" }, { fieldKeySnapshot: "asc" }],
      },
      receiptUploads: {
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!session) return null
  if (session.cashRegister.location.organizationId !== input.organizationId) return null
  const allowedFieldKeysByWorkday = {
    [session.workdayId]: new Set(session.fieldValues.map((value) => value.fieldKeySnapshot)),
  }
  const photosByWorkday = await listWorkdayCashFieldPhotos(tx, {
    workdayIds: [session.workdayId],
    allowedFieldKeysByWorkday,
  })

  return {
    ...session,
    closedByEmployee: session.closedByEmployee
      ? {
          id: session.closedByEmployee.id,
          fullName: session.closedByEmployee.user.fullName,
        }
      : null,
    cashFieldPhotos: photosByWorkday[session.workdayId] ?? [],
  }
}

export async function getLocationCashConfig(
  tx: Prisma.TransactionClient,
  locationId: string,
): Promise<
  | {
      ok: true
      fields: CashFieldConfig[]
      formula: { expression: string; resultLabel: string; resultKey: string }
    }
  | { ok: false; error: string }
> {
  const [fieldRows, formula] = await Promise.all([
    tx.cashRegisterField.findMany({
      where: { locationId, isActive: true },
      orderBy: [{ inputStage: "asc" }, { displayOrder: "asc" }, { key: "asc" }],
    }),
    tx.cashRegisterFormula.findFirst({
      where: {
        locationId,
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ])

  if (!formula) {
    return {
      ok: false,
      error: "Формула кассы не настроена",
    }
  }

  const fields: CashFieldConfig[] = []
  for (const field of fieldRows) {
    if (!isCashInputStage(field.inputStage)) {
      return {
        ok: false,
        error: `Некорректный input_stage в поле кассы: ${field.key}`,
      }
    }

    fields.push({
      id: field.id,
      key: field.key,
      label: field.label,
      inputStage: field.inputStage,
      isRequired: field.isRequired,
      isRevenueBasis: field.isRevenueBasis,
      displayOrder: field.displayOrder,
    })
  }

  if (fields.length === 0) {
    return {
      ok: false,
      error: "Поля кассы не настроены",
    }
  }

  return {
    ok: true,
    fields,
    formula: {
      expression: formula.expression,
      resultLabel: formula.resultLabel,
      resultKey: formula.resultKey,
    },
  }
}

export async function replaceCashSessionFieldSnapshots(
  tx: Prisma.TransactionClient,
  cashSessionId: string,
  snapshots: CashSessionFieldSnapshot[],
) {
  await tx.cashSessionFieldValue.deleteMany({
    where: { cashSessionId },
  })

  if (snapshots.length === 0) return

  await tx.cashSessionFieldValue.createMany({
    data: snapshots.map((snapshot) => ({
      cashSessionId,
      cashRegisterFieldId: snapshot.cashRegisterFieldId || null,
      fieldKeySnapshot: snapshot.fieldKeySnapshot,
      fieldLabelSnapshot: snapshot.fieldLabelSnapshot,
      inputStage: snapshot.inputStage,
      isRequiredSnapshot: snapshot.isRequiredSnapshot,
      valueCents: snapshot.valueCents,
      isRevenueBasisSnapshot: snapshot.isRevenueBasisSnapshot,
      source: snapshot.source ?? "manual",
    })),
  })
}

export async function createCashSessionAuditLog(
  tx: Prisma.TransactionClient,
  input: {
    cashSessionId: string
    actorUserId?: string | null
    action: string
    reason?: string | null
    payload?: Prisma.InputJsonValue | null
  },
) {
  await tx.cashSessionAuditLog.create({
    data: {
      cashSessionId: input.cashSessionId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      reason: input.reason ?? null,
      payload: input.payload ?? undefined,
    },
  })
}
