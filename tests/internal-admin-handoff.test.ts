import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import {
  LEVEL_BUTTON_LABEL,
  preselectUrl,
  selectorUrl,
} from "../internal-admin/lib/main-app-links"

const MAIN = "https://crewlly.com"
const ORG_ID = "00000000-0000-0000-0000-0000000000a1"

describe("admin → main-app handoff links", () => {
  it("selectorUrl points at /internal with no query", () => {
    expect(selectorUrl(MAIN)).toBe("https://crewlly.com/internal")
  })

  it("preselectUrl encodes organizationId + accessLevel as intent", () => {
    expect(preselectUrl(MAIN, ORG_ID, "owner_view")).toBe(
      `https://crewlly.com/internal?organizationId=${ORG_ID}&accessLevel=owner_view`,
    )
    expect(preselectUrl(MAIN, ORG_ID, "employee_view")).toBe(
      `https://crewlly.com/internal?organizationId=${ORG_ID}&accessLevel=employee_view`,
    )
  })

  it("trims a trailing slash on the base URL", () => {
    expect(preselectUrl("https://crewlly.com/", ORG_ID, "owner_view")).toBe(
      `https://crewlly.com/internal?organizationId=${ORG_ID}&accessLevel=owner_view`,
    )
  })

  it("has button labels for both levels", () => {
    expect(LEVEL_BUTTON_LABEL.owner_view).toBe("Open as owner")
    expect(LEVEL_BUTTON_LABEL.employee_view).toBe("Open as employee")
  })
})

// ── Invariant: the admin app must NEVER start a session itself ────────────────

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full)
  }
  return acc
}

describe("admin app does not start InternalAccessSession", () => {
  it("no admin source references the start endpoint or a POST to access-session", () => {
    const root = join(__dirname, "..", "internal-admin")
    const files = walk(root)
    expect(files.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const f of files) {
      // Skip test files if any exist under the app (none currently).
      const src = readFileSync(f, "utf8")
      if (src.includes("access-session/start") || src.includes("access-session/end")) {
        offenders.push(f)
      }
    }
    expect(offenders).toEqual([])
  })
})
