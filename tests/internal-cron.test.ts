import { afterEach, describe, expect, it } from "vitest"
import { isAuthorizedInternalCronRequest } from "../lib/internal-cron"

const ORIGINAL_ENV = { ...process.env }

function createRequest(headers: Record<string, string>) {
  return new Request("http://localhost/api/internal/test", {
    method: "POST",
    headers,
  })
}

describe("isAuthorizedInternalCronRequest", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it("accepts the shared internal cron secret", () => {
    process.env.INTERNAL_CRON_SECRET = "shared-secret"

    const request = createRequest({ "x-cron-secret": "shared-secret" })

    expect(isAuthorizedInternalCronRequest(request, ["INTERNAL_CRON_SECRET", "WORK_INTERVAL_CONSISTENCY_CRON_SECRET"])).toBe(true)
  })

  it("falls back to dedicated per-job secrets", () => {
    delete process.env.INTERNAL_CRON_SECRET
    process.env.WORK_INTERVAL_CONSISTENCY_CRON_SECRET = "job-secret"

    const request = createRequest({ authorization: "Bearer job-secret" })

    expect(isAuthorizedInternalCronRequest(request, ["INTERNAL_CRON_SECRET", "WORK_INTERVAL_CONSISTENCY_CRON_SECRET"])).toBe(true)
  })

  it("rejects invalid secrets when secrets are configured", () => {
    process.env.INTERNAL_CRON_SECRET = "shared-secret"
    process.env.WORK_INTERVAL_CONSISTENCY_CRON_SECRET = "job-secret"

    const request = createRequest({ "x-cron-secret": "wrong-secret" })

    expect(isAuthorizedInternalCronRequest(request, ["INTERNAL_CRON_SECRET", "WORK_INTERVAL_CONSISTENCY_CRON_SECRET"])).toBe(false)
  })

  it("allows requests in non-production when no secret is configured", () => {
    delete process.env.INTERNAL_CRON_SECRET
    delete process.env.WORK_INTERVAL_CONSISTENCY_CRON_SECRET
    process.env.NODE_ENV = "test"

    const request = createRequest({})

    expect(isAuthorizedInternalCronRequest(request, ["INTERNAL_CRON_SECRET", "WORK_INTERVAL_CONSISTENCY_CRON_SECRET"])).toBe(true)
  })
})
