import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    position: {
      findUnique: vi.fn(),
    },
    ruleTemplate: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    prisma,
    getSessionUserWithOrg: vi.fn(),
    isOwnerOrManagerRole: vi.fn(),
    syncScheduledProceduresForPosition: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUserWithOrg: mocked.getSessionUserWithOrg,
  isOwnerOrManagerRole: mocked.isOwnerOrManagerRole,
}))

vi.mock("@/lib/procedures/scheduled-sync", () => ({
  syncScheduledProceduresForPosition: mocked.syncScheduledProceduresForPosition,
}))

import { POST as POST_RULES } from "../app/api/positions/[id]/rules/route"
import { PATCH as PATCH_RULE } from "../app/api/positions/[id]/rules/[ruleId]/route"

describe("positions rules routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocked.getSessionUserWithOrg.mockResolvedValue({
      organization: { id: "org_1" },
      membership: { role: "OWNER" },
    })
    mocked.isOwnerOrManagerRole.mockReturnValue(true)
    mocked.prisma.position.findUnique.mockResolvedValue({ id: "pos_1", organizationId: "org_1" })
    mocked.prisma.ruleTemplate.count.mockResolvedValue(0)
    mocked.syncScheduledProceduresForPosition.mockResolvedValue(undefined)
  })

  it("POST creates a rule for each selected weekday via dayOfWeeks", async () => {
    const tx = {
      ruleTemplate: {
        create: vi.fn(),
      },
    }

    let createIndex = 0
    tx.ruleTemplate.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: `rule_${++createIndex}`,
      ...data,
      checklistItems: (data.checklistItems?.create ?? []).map((item: any, index: number) => ({
        id: `item_${index + 1}`,
        ...item,
      })),
    }))

    mocked.prisma.$transaction.mockImplementation(async (cb: (db: typeof tx) => Promise<unknown>) => cb(tx))

    const response = await POST_RULES(
      new Request("http://localhost/api/positions/pos_1/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          when: "OPEN",
          type: "CHECKLIST",
          title: "Подготовка смены",
          required: true,
          order: 3,
          dayOfWeeks: ["MON", "WED", "MON"],
          checklistItems: [{ title: "Проверить зал", order: 1 }],
        }),
      }),
      { params: Promise.resolve({ id: "pos_1" }) },
    )

    const body = await response.json()

    expect(response.status).toBe(201)
    expect(tx.ruleTemplate.create).toHaveBeenCalledTimes(2)
    expect(tx.ruleTemplate.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ dayOfWeek: "MON" }),
      }),
    )
    expect(tx.ruleTemplate.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ dayOfWeek: "WED" }),
      }),
    )
    expect(body.meta).toEqual({ createdCount: 2 })
    expect(mocked.syncScheduledProceduresForPosition).toHaveBeenCalledWith("pos_1")
  })

  it("POST rejects mixed default and dayOfWeeks payload", async () => {
    const response = await POST_RULES(
      new Request("http://localhost/api/positions/pos_1/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          when: "OPEN",
          type: "INPUT",
          title: "Температура",
          required: true,
          order: 1,
          dayOfWeek: null,
          dayOfWeeks: ["MON", "TUE"],
        }),
      }),
      { params: Promise.resolve({ id: "pos_1" }) },
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Используйте либо dayOfWeek, либо dayOfWeeks")
  })

  it("PATCH can fan-out one rule to multiple weekdays", async () => {
    mocked.prisma.ruleTemplate.findUnique.mockResolvedValue({
      id: "rule_existing",
      positionId: "pos_1",
      when: "OPEN",
      type: "CHECKLIST",
      title: "Открытие",
      required: true,
      order: 2,
      dayOfWeek: "MON",
      position: { id: "pos_1", organizationId: "org_1" },
      checklistItems: [{ id: "item_existing", title: "Включить свет", order: 1 }],
    })

    const tx = {
      ruleTemplate: {
        update: vi.fn(),
        create: vi.fn(),
      },
      ruleChecklistItemTemplate: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        findMany: vi.fn(),
      },
    }

    tx.ruleTemplate.update.mockImplementation(async ({ data }: { data: any }) => ({
      id: "rule_existing",
      positionId: "pos_1",
      when: data.when,
      type: data.type ?? "CHECKLIST",
      title: data.title,
      required: data.required,
      order: data.order ?? 2,
      dayOfWeek: data.dayOfWeek,
    }))

    tx.ruleChecklistItemTemplate.deleteMany.mockResolvedValue({ count: 1 })
    tx.ruleChecklistItemTemplate.createMany.mockResolvedValue({ count: 1 })
    tx.ruleChecklistItemTemplate.findMany.mockResolvedValue([{ id: "item_existing", title: "Включить свет", order: 1 }])

    tx.ruleTemplate.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: "rule_clone",
      ...data,
      checklistItems: (data.checklistItems?.create ?? []).map((item: any, index: number) => ({
        id: `clone_item_${index + 1}`,
        ...item,
      })),
    }))

    mocked.prisma.$transaction.mockImplementation(async (cb: (db: typeof tx) => Promise<unknown>) => cb(tx))

    const response = await PATCH_RULE(
      new Request("http://localhost/api/positions/pos_1/rules/rule_existing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeeks: ["TUE", "THU"],
        }),
      }),
      { params: Promise.resolve({ id: "pos_1", ruleId: "rule_existing" }) },
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(tx.ruleTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rule_existing" },
        data: expect.objectContaining({ dayOfWeek: "TUE" }),
      }),
    )
    expect(tx.ruleTemplate.create).toHaveBeenCalledTimes(1)
    expect(tx.ruleTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dayOfWeek: "THU" }),
      }),
    )
    expect(body.meta).toEqual({ savedCount: 2 })
    expect(mocked.syncScheduledProceduresForPosition).toHaveBeenCalledWith("pos_1")
  })
})
