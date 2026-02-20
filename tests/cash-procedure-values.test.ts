import { describe, expect, it } from "vitest"
import {
  getMissingCashProcedurePhotoFieldKeys,
  normalizeCashProcedurePhotoMap,
} from "../lib/cash/procedure-values"

describe("cash procedure photo requirements", () => {
  it("returns missing photo keys only for filled fields with photo requirement", () => {
    const missing = getMissingCashProcedurePhotoFieldKeys({
      packed: "1300|20000|",
      fields: [
        { key: "deposit", isRequired: true, isPhotoRequired: true },
        { key: "terminal", isRequired: false, isPhotoRequired: true },
        { key: "cash", isRequired: false, isPhotoRequired: true },
      ],
      photosRaw: {
        terminal: { photoS3Key: "a/b/c.jpg", photoUrl: "http://localhost/img.jpg" },
      },
    })

    expect(missing).toEqual(["deposit"])
  })

  it("ignores unknown keys and empty photo payloads", () => {
    const normalized = normalizeCashProcedurePhotoMap(
      {
        deposit: { photoS3Key: "", photoUrl: "" },
        terminal: { photoS3Key: "s3://key", photoUrl: null },
        unknown: { photoS3Key: "x", photoUrl: "y" },
      },
      new Set(["deposit", "terminal"]),
    )

    expect(normalized).toEqual({
      terminal: { photoS3Key: "s3://key", photoUrl: null },
    })
  })
})
