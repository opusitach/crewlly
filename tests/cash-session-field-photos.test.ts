import { describe, expect, it, vi } from "vitest"
import { listWorkdayCashFieldPhotos } from "../lib/cash/session-field-photos"

const buildDbMock = (rows: Array<Record<string, unknown>>) =>
  ({
    workIntervalProcedureAnswer: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  }) as any

describe("cash session field photos", () => {
  it("returns photos from first CASH answer per stage and filters unknown keys", async () => {
    const db = buildDbMock([
      {
        id: "open-1",
        when: "OPEN",
        workIntervalId: "interval-open",
        cashPhotosJson: {
          deposit: { photoS3Key: "s3://open", photoUrl: "https://cdn/open.jpg" },
          unknown: { photoS3Key: "s3://unknown", photoUrl: "https://cdn/unknown.jpg" },
        },
        createdAt: new Date("2026-02-17T08:00:00.000Z"),
        workInterval: { workdayId: "workday-1" },
      },
      {
        id: "open-2-later",
        when: "OPEN",
        workIntervalId: "interval-open-later",
        cashPhotosJson: {
          deposit: { photoS3Key: "s3://open-later", photoUrl: "https://cdn/open-later.jpg" },
        },
        createdAt: new Date("2026-02-17T08:05:00.000Z"),
        workInterval: { workdayId: "workday-1" },
      },
      {
        id: "close-1",
        when: "CLOSE",
        workIntervalId: "interval-close",
        cashPhotosJson: {
          terminal: { photoS3Key: "s3://close", photoUrl: "https://cdn/close.jpg" },
        },
        createdAt: new Date("2026-02-17T22:00:00.000Z"),
        workInterval: { workdayId: "workday-1" },
      },
    ])

    const result = await listWorkdayCashFieldPhotos(db, {
      workdayIds: ["workday-1"],
      allowedFieldKeysByWorkday: {
        "workday-1": new Set(["deposit", "terminal"]),
      },
    })

    expect(result["workday-1"]).toHaveLength(2)
    expect(result["workday-1"][0]).toMatchObject({
      answerId: "open-1",
      inputStage: "open",
      fieldKey: "deposit",
      photoUrl: "https://cdn/open.jpg",
    })
    expect(result["workday-1"][1]).toMatchObject({
      answerId: "close-1",
      inputStage: "close",
      fieldKey: "terminal",
      photoUrl: "https://cdn/close.jpg",
    })
  })

  it("returns empty map for empty workday list", async () => {
    const db = buildDbMock([])
    const result = await listWorkdayCashFieldPhotos(db, {
      workdayIds: [],
    })
    expect(result).toEqual({})
    expect(db.workIntervalProcedureAnswer.findMany).toHaveBeenCalledTimes(0)
  })
})
