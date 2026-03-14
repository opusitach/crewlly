import { getSchedulerHealthSnapshot } from "./index.mjs"

try {
  const snapshot = getSchedulerHealthSnapshot()
  if (!snapshot.ok) {
    console.error("[internal_scheduler] unhealthy", JSON.stringify(snapshot))
    process.exit(1)
  }

  console.log(JSON.stringify(snapshot))
} catch (error) {
  console.error("[internal_scheduler] healthcheck failed", error instanceof Error ? error.message : String(error))
  process.exit(1)
}
