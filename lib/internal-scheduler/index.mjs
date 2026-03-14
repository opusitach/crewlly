import fs from "node:fs"
import path from "node:path"

export const DEFAULT_INTERNAL_SCHEDULER_BASE_URL = "http://back:3001"
export const DEFAULT_INTERNAL_SCHEDULER_STATE_PATH = "/tmp/internal-scheduler-state.json"
export const INTERNAL_SCHEDULER_STARTUP_STAGGER_MS = 5_000
export const INTERNAL_SCHEDULER_HEALTH_GRACE_MS = 60_000

export const INTERNAL_SCHEDULER_JOB_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "shift_auto_close",
    displayName: "stale shift auto-close",
    endpointPath: "/api/internal/work-intervals/auto-complete",
    intervalEnvKey: "STALE_SHIFT_AUTO_CLOSE_INTERVAL_SECONDS",
    defaultIntervalSeconds: 900,
    urlEnvKey: "STALE_SHIFT_AUTO_CLOSE_URL",
    secretEnvKey: "STALE_SHIFT_AUTO_CLOSE_CRON_SECRET",
  }),
  Object.freeze({
    id: "work_interval_consistency_monitor",
    displayName: "work interval consistency check",
    endpointPath: "/api/internal/work-intervals/consistency-check",
    intervalEnvKey: "WORK_INTERVAL_CONSISTENCY_INTERVAL_SECONDS",
    defaultIntervalSeconds: 900,
    urlEnvKey: "WORK_INTERVAL_CONSISTENCY_URL",
    secretEnvKey: "WORK_INTERVAL_CONSISTENCY_CRON_SECRET",
  }),
])

export function parsePositiveIntegerEnv(value, { envKey, defaultValue }) {
  if (value == null || value === "") {
    return defaultValue
  }

  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envKey} must be a positive integer`)
  }

  return parsed
}

export function resolveSchedulerJobSecret(env, secretEnvKey) {
  const sharedSecret = typeof env.INTERNAL_CRON_SECRET === "string" ? env.INTERNAL_CRON_SECRET.trim() : ""
  if (sharedSecret) {
    return sharedSecret
  }

  const dedicatedSecret = typeof env[secretEnvKey] === "string" ? env[secretEnvKey].trim() : ""
  if (dedicatedSecret) {
    return dedicatedSecret
  }

  throw new Error(`Missing INTERNAL_CRON_SECRET or ${secretEnvKey}`)
}

export function resolveSchedulerJobUrl(env, definition) {
  const overrideUrl = typeof env[definition.urlEnvKey] === "string" ? env[definition.urlEnvKey].trim() : ""
  if (overrideUrl) {
    return overrideUrl
  }

  const baseUrl =
    typeof env.INTERNAL_SCHEDULER_BASE_URL === "string" && env.INTERNAL_SCHEDULER_BASE_URL.trim()
      ? env.INTERNAL_SCHEDULER_BASE_URL.trim()
      : DEFAULT_INTERNAL_SCHEDULER_BASE_URL

  return new URL(definition.endpointPath, baseUrl).toString()
}

export function resolveSchedulerJobs(env = process.env) {
  return INTERNAL_SCHEDULER_JOB_DEFINITIONS.map((definition) => {
    const intervalSeconds = parsePositiveIntegerEnv(env[definition.intervalEnvKey], {
      envKey: definition.intervalEnvKey,
      defaultValue: definition.defaultIntervalSeconds,
    })

    return {
      ...definition,
      intervalSeconds,
      intervalMs: intervalSeconds * 1_000,
      secret: resolveSchedulerJobSecret(env, definition.secretEnvKey),
      url: resolveSchedulerJobUrl(env, definition),
    }
  })
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value))
}

export function createSchedulerStateStore({
  statePath = DEFAULT_INTERNAL_SCHEDULER_STATE_PATH,
  now = () => new Date(),
} = {}) {
  let state = {
    version: 1,
    startedAt: null,
    updatedAt: null,
    jobs: {},
  }

  function persist() {
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  }

  return {
    statePath,
    initialize(jobs) {
      const timestamp = now().toISOString()
      state = {
        version: 1,
        startedAt: timestamp,
        updatedAt: timestamp,
        jobs: Object.fromEntries(
          jobs.map((job) => [
            job.id,
            {
              displayName: job.displayName,
              intervalSeconds: job.intervalSeconds,
              url: job.url,
              running: false,
              lastOutcome: "never_run",
              lastStartedAt: null,
              lastFinishedAt: null,
              lastSucceededAt: null,
              lastFailedAt: null,
              lastDurationMs: null,
              lastStatus: null,
              lastError: null,
            },
          ]),
        ),
      }
      persist()
    },
    markJobStarted(job) {
      const timestamp = now().toISOString()
      state.jobs[job.id] = {
        ...(state.jobs[job.id] ?? {}),
        displayName: job.displayName,
        intervalSeconds: job.intervalSeconds,
        url: job.url,
        running: true,
        lastStartedAt: timestamp,
        lastError: null,
      }
      state.updatedAt = timestamp
      persist()
    },
    markJobFinished(job, result) {
      const timestamp = now().toISOString()
      state.jobs[job.id] = {
        ...(state.jobs[job.id] ?? {}),
        displayName: job.displayName,
        intervalSeconds: job.intervalSeconds,
        url: job.url,
        running: false,
        lastOutcome: result.ok ? "success" : "failure",
        lastFinishedAt: timestamp,
        lastSucceededAt: result.ok ? timestamp : state.jobs[job.id]?.lastSucceededAt ?? null,
        lastFailedAt: result.ok ? state.jobs[job.id]?.lastFailedAt ?? null : timestamp,
        lastDurationMs: result.durationMs,
        lastStatus: result.status ?? null,
        lastError: result.ok ? null : result.error,
      }
      state.updatedAt = timestamp
      persist()
    },
    read() {
      return cloneState(state)
    },
  }
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export async function runSchedulerJob(job, { fetchImpl = fetch, logger = console, stateStore, now = () => new Date() } = {}) {
  const startedAt = now()
  stateStore?.markJobStarted(job)
  logger.info(`[internal_scheduler:${job.id}] Starting ${job.displayName}`)

  try {
    const response = await fetchImpl(job.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": job.secret,
      },
    })

    const bodyText = await response.text()
    let payload = null
    try {
      payload = JSON.parse(bodyText)
    } catch {}

    if (!response.ok) {
      throw new Error(`${job.displayName} request failed with ${response.status}: ${bodyText}`)
    }

    if (payload && payload.ok === false) {
      throw new Error(`${job.displayName} reported failure: ${bodyText}`)
    }

    const durationMs = now().getTime() - startedAt.getTime()
    stateStore?.markJobFinished(job, {
      ok: true,
      status: response.status,
      durationMs,
    })
    logger.info(`[internal_scheduler:${job.id}] Completed in ${durationMs}ms`)

    return {
      status: response.status,
      bodyText,
      payload,
    }
  } catch (error) {
    const durationMs = now().getTime() - startedAt.getTime()
    const message = toErrorMessage(error)
    stateStore?.markJobFinished(job, {
      ok: false,
      status: null,
      durationMs,
      error: message,
    })
    logger.error(`[internal_scheduler:${job.id}] ${message}`)
    throw error
  }
}

export function readSchedulerState(statePath = DEFAULT_INTERNAL_SCHEDULER_STATE_PATH) {
  if (!fs.existsSync(statePath)) {
    return null
  }

  const raw = fs.readFileSync(statePath, "utf8")
  return JSON.parse(raw)
}

export function getSchedulerHealthSnapshot({
  env = process.env,
  statePath = env.INTERNAL_SCHEDULER_STATE_PATH || DEFAULT_INTERNAL_SCHEDULER_STATE_PATH,
  now = () => new Date(),
} = {}) {
  const jobs = resolveSchedulerJobs(env)
  const state = readSchedulerState(statePath)

  if (!state) {
    return {
      ok: false,
      reason: "missing_state_file",
      statePath,
    }
  }

  const updatedAtMs = Date.parse(state.updatedAt)
  if (!Number.isFinite(updatedAtMs)) {
    return {
      ok: false,
      reason: "invalid_state_timestamp",
      statePath,
    }
  }

  const missingJobs = jobs.filter((job) => !(job.id in (state.jobs ?? {}))).map((job) => job.id)
  if (missingJobs.length > 0) {
    return {
      ok: false,
      reason: "missing_jobs",
      statePath,
      missingJobs,
    }
  }

  const maxIntervalMs = Math.max(...jobs.map((job) => job.intervalMs))
  const staleAfterMs = maxIntervalMs * 2 + INTERNAL_SCHEDULER_HEALTH_GRACE_MS
  const ageMs = now().getTime() - updatedAtMs

  if (ageMs > staleAfterMs) {
    return {
      ok: false,
      reason: "stale_state",
      statePath,
      ageMs,
      staleAfterMs,
    }
  }

  return {
    ok: true,
    statePath,
    updatedAt: state.updatedAt,
    ageMs,
    staleAfterMs,
    jobIds: jobs.map((job) => job.id),
  }
}

export function startInternalScheduler({
  env = process.env,
  fetchImpl = fetch,
  logger = console,
  now = () => new Date(),
  statePath = env.INTERNAL_SCHEDULER_STATE_PATH || DEFAULT_INTERNAL_SCHEDULER_STATE_PATH,
  shutdownTimeoutMs = 15_000,
  registerSignalHandlers = true,
} = {}) {
  const jobs = resolveSchedulerJobs(env)
  const stateStore = createSchedulerStateStore({ statePath, now })
  stateStore.initialize(jobs)

  const activeRuns = new Set()
  const intervalHandles = []
  const startupHandles = []

  jobs.forEach((job, index) => {
    let isRunning = false

    const run = () => {
      if (isRunning) {
        logger.warn(`[internal_scheduler:${job.id}] Skipping run because the previous execution is still in progress`)
        return
      }

      isRunning = true
      const runPromise = runSchedulerJob(job, {
        fetchImpl,
        logger,
        stateStore,
        now,
      }).catch(() => {
        // Errors are already logged and persisted; keep the scheduler alive.
      })

      activeRuns.add(runPromise)
      runPromise.finally(() => {
        activeRuns.delete(runPromise)
        isRunning = false
      })
    }

    const startupHandle = setTimeout(() => {
      run()
      const intervalHandle = setInterval(run, job.intervalMs)
      intervalHandles.push(intervalHandle)
    }, index * INTERNAL_SCHEDULER_STARTUP_STAGGER_MS)

    startupHandles.push(startupHandle)
  })

  let shutdownPromise = null

  const shutdown = async (signal = "manual") => {
    if (shutdownPromise) {
      return shutdownPromise
    }

    shutdownPromise = (async () => {
      logger.info(`[internal_scheduler] Shutting down on ${signal}`)
      for (const handle of startupHandles) {
        clearTimeout(handle)
      }
      for (const handle of intervalHandles) {
        clearInterval(handle)
      }

      const pendingRuns = [...activeRuns]
      if (pendingRuns.length > 0) {
        await Promise.race([
          Promise.allSettled(pendingRuns),
          new Promise((resolve) => setTimeout(resolve, shutdownTimeoutMs)),
        ])
      }
    })()

    return shutdownPromise
  }

  if (registerSignalHandlers && typeof process !== "undefined" && typeof process.on === "function") {
    const handleSignal = (signal) => {
      shutdown(signal)
        .catch((error) => {
          logger.error(`[internal_scheduler] Shutdown failed: ${toErrorMessage(error)}`)
          process.exit(1)
        })
        .then(() => {
          process.exit(0)
        })
    }

    process.on("SIGINT", handleSignal)
    process.on("SIGTERM", handleSignal)
  }

  return {
    jobs,
    statePath,
    shutdown,
    stateStore,
  }
}
