import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createSchedulerStateStore,
  getSchedulerHealthSnapshot,
  resolveSchedulerJobs,
  runSchedulerJob,
} from "../lib/internal-scheduler/index.mjs"

function createTempStatePath() {
  return path.join(os.tmpdir(), `internal-scheduler-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
}

describe("internal scheduler", () => {
  const statePaths: string[] = []

  afterEach(() => {
    for (const statePath of statePaths) {
      fs.rmSync(statePath, { force: true })
    }
    statePaths.length = 0
  })

  it("resolves jobs from shared scheduler config", () => {
    const jobs = resolveSchedulerJobs({
      INTERNAL_CRON_SECRET: "shared-secret",
      INTERNAL_SCHEDULER_BASE_URL: "http://scheduler-back:3001",
      STALE_SHIFT_AUTO_CLOSE_INTERVAL_SECONDS: "600",
      WORK_INTERVAL_CONSISTENCY_INTERVAL_SECONDS: "1200",
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        id: "shift_auto_close",
        intervalSeconds: 600,
        secret: "shared-secret",
        url: "http://scheduler-back:3001/api/internal/work-intervals/auto-complete",
      }),
      expect.objectContaining({
        id: "work_interval_consistency_monitor",
        intervalSeconds: 1200,
        secret: "shared-secret",
        url: "http://scheduler-back:3001/api/internal/work-intervals/consistency-check",
      }),
    ])
  })

  it("falls back to per-job secrets and URL overrides", () => {
    const jobs = resolveSchedulerJobs({
      STALE_SHIFT_AUTO_CLOSE_CRON_SECRET: "auto-close-secret",
      STALE_SHIFT_AUTO_CLOSE_URL: "http://internal/api/custom-auto-close",
      WORK_INTERVAL_CONSISTENCY_CRON_SECRET: "consistency-secret",
      WORK_INTERVAL_CONSISTENCY_URL: "http://internal/api/custom-consistency",
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        id: "shift_auto_close",
        secret: "auto-close-secret",
        url: "http://internal/api/custom-auto-close",
      }),
      expect.objectContaining({
        id: "work_interval_consistency_monitor",
        secret: "consistency-secret",
        url: "http://internal/api/custom-consistency",
      }),
    ])
  })

  it("persists successful job execution and reports healthy state", async () => {
    const statePath = createTempStatePath()
    statePaths.push(statePath)

    const env = {
      INTERNAL_CRON_SECRET: "shared-secret",
      INTERNAL_SCHEDULER_BASE_URL: "http://back:3001",
      INTERNAL_SCHEDULER_STATE_PATH: statePath,
    }
    const jobs = resolveSchedulerJobs(env)
    const stateStore = createSchedulerStateStore({
      statePath,
      now: () => new Date("2026-03-14T12:00:00.000Z"),
    })

    stateStore.initialize(jobs)

    const result = await runSchedulerJob(jobs[0], {
      stateStore,
      now: () => new Date("2026-03-14T12:00:05.000Z"),
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true, closed: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      logger: { info() {}, warn() {}, error() {} },
    })

    expect(result.payload).toEqual({ ok: true, closed: 1 })

    const persisted = stateStore.read()
    expect(persisted.jobs.shift_auto_close).toEqual(
      expect.objectContaining({
        running: false,
        lastOutcome: "success",
        lastStatus: 200,
        lastError: null,
      }),
    )

    const health = getSchedulerHealthSnapshot({
      env,
      statePath,
      now: () => new Date("2026-03-14T12:05:00.000Z"),
    })

    expect(health).toEqual(
      expect.objectContaining({
        ok: true,
        statePath,
        jobIds: ["shift_auto_close", "work_interval_consistency_monitor"],
      }),
    )
  })

  it("persists failed job execution when payload reports drift", async () => {
    const statePath = createTempStatePath()
    statePaths.push(statePath)

    const env = {
      INTERNAL_CRON_SECRET: "shared-secret",
      INTERNAL_SCHEDULER_STATE_PATH: statePath,
    }
    const jobs = resolveSchedulerJobs(env)
    const stateStore = createSchedulerStateStore({
      statePath,
      now: () => new Date("2026-03-14T12:00:00.000Z"),
    })

    stateStore.initialize(jobs)

    await expect(
      runSchedulerJob(jobs[1], {
        stateStore,
        now: () => new Date("2026-03-14T12:00:10.000Z"),
        fetchImpl: async () =>
          new Response(JSON.stringify({ ok: false, driftCount: 3 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        logger: { info() {}, warn() {}, error() {} },
      }),
    ).rejects.toThrow(/reported failure/)

    const persisted = stateStore.read()
    expect(persisted.jobs.work_interval_consistency_monitor).toEqual(
      expect.objectContaining({
        running: false,
        lastOutcome: "failure",
        lastStatus: null,
        lastError: expect.stringContaining("reported failure"),
      }),
    )
  })

  it("reports unhealthy state when scheduler heartbeat becomes stale", () => {
    const statePath = createTempStatePath()
    statePaths.push(statePath)

    const env = {
      INTERNAL_CRON_SECRET: "shared-secret",
      INTERNAL_SCHEDULER_STATE_PATH: statePath,
    }
    const jobs = resolveSchedulerJobs(env)
    const stateStore = createSchedulerStateStore({
      statePath,
      now: () => new Date("2026-03-14T12:00:00.000Z"),
    })

    stateStore.initialize(jobs)

    const health = getSchedulerHealthSnapshot({
      env,
      statePath,
      now: () => new Date("2026-03-14T13:00:01.000Z"),
    })

    expect(health).toEqual(
      expect.objectContaining({
        ok: false,
        reason: "stale_state",
        statePath,
      }),
    )
  })
})
