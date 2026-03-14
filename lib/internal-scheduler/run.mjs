import { startInternalScheduler } from "./index.mjs"

try {
  startInternalScheduler()
} catch (error) {
  console.error("[internal_scheduler] Failed to start", error instanceof Error ? error.message : String(error))
  process.exit(1)
}
