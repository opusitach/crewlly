import { createHash, randomUUID } from "node:crypto"

type AuditOutcome = "success" | "denied" | "failure"

type AuditActor = {
  auth_state?: "authenticated" | "anonymous"
  user_id?: string | null
  organization_id?: string | null
  access_role?: string | null
  primary_mode?: string | null
  employee_id?: string | null
}

type AuditTarget = {
  type?: string
  id?: string | null
  organization_id?: string | null
  location_id?: string | null
  workday_id?: string | null
  employee_id?: string | null
  invitation_id?: string | null
}

type AuditMetadata = Record<string, unknown>

type AuditLogEvent = {
  event_type: string
  outcome: AuditOutcome
  status: number
  route: string
  actor?: AuditActor
  target?: AuditTarget
  reason?: string
  metadata?: AuditMetadata
}

type SessionLike = {
  user?: {
    id?: string | null
    primaryMode?: string | null
  } | null
  organization?: {
    id?: string | null
  } | null
  membership?: {
    legacyRole?: string | null
    accessRole?: {
      key?: string | null
    } | null
  } | null
  accessRole?: {
    key?: string | null
  } | null
} | null

const MAX_STRING_LENGTH = 512
const MAX_ARRAY_ITEMS = 20
const MAX_OBJECT_KEYS = 50
const REDACTED = "[REDACTED]"
const SENSITIVE_KEY_PATTERNS = [
  /^password$/i,
  /^password_hash$/i,
  /^passwordhash$/i,
  /^token$/i,
  /^session_token$/i,
  /^sessiontoken$/i,
  /^cookie$/i,
  /^cookies$/i,
  /^authorization$/i,
  /^secret$/i,
  /^api[_-]?key$/i,
  /^invite_url$/i,
  /^inviteurl$/i,
  /^x-cron-secret$/i,
]

function trimString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
    return REDACTED
  }

  if (value == null) {
    return value
  }

  if (typeof value === "string") {
    return trimString(value)
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((entry) => sanitizeValue(entry))
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [entryKey, entryValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      output[entryKey] = sanitizeValue(entryValue, entryKey)
    }
    return output
  }

  return String(value)
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null
  }

  return request.headers.get("x-real-ip")
}

function getRequestId(request: Request) {
  return request.headers.get("x-request-id") || request.headers.get("x-correlation-id") || randomUUID()
}

function getLogLevel(outcome: AuditOutcome, status: number) {
  if (outcome === "success") return "info"
  if (status >= 500) return "error"
  return "warn"
}

function toStatusClass(status: number) {
  return `${Math.floor(status / 100)}xx`
}

export function isAuditLoggingEnabled(env: NodeJS.ProcessEnv = process.env) {
  const explicit = env.AUDIT_LOG_ENABLED
  if (explicit != null) {
    return explicit !== "false" && explicit !== "0"
  }

  return env.NODE_ENV === "production"
}

export function hashAuditIdentifier(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 16)
}

export function auditActorFromSession(session: SessionLike, extras?: Partial<AuditActor>): AuditActor {
  return compactObject({
    auth_state: session?.user?.id ? "authenticated" : "anonymous",
    user_id: session?.user?.id ?? null,
    organization_id: session?.organization?.id ?? null,
    access_role:
      session?.accessRole?.key ??
      session?.membership?.accessRole?.key ??
      session?.membership?.legacyRole ??
      null,
    primary_mode: session?.user?.primaryMode ?? null,
    ...extras,
  })
}

export function sanitizeAuditMetadata(value: AuditMetadata | undefined) {
  if (!value) {
    return undefined
  }

  return sanitizeValue(value) as AuditMetadata
}

export function logAuditEvent(request: Request, event: AuditLogEvent) {
  if (!isAuditLoggingEnabled()) {
    return
  }

  const url = new URL(request.url)
  const payload = compactObject({
    "@timestamp": new Date().toISOString(),
    schema_version: 1,
    kind: "audit",
    level: getLogLevel(event.outcome, event.status),
    service: process.env.APP_SERVICE_NAME ?? "app",
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    event_type: event.event_type,
    outcome: event.outcome,
    status: event.status,
    status_class: toStatusClass(event.status),
    route: event.route,
    reason: event.reason,
    request: compactObject({
      id: getRequestId(request),
      method: request.method,
      path: url.pathname,
      ip: getClientIp(request),
      user_agent: request.headers.get("user-agent") ?? null,
    }),
    actor: sanitizeValue(event.actor),
    target: sanitizeValue(event.target),
    metadata: sanitizeAuditMetadata(event.metadata),
  })

  console.log(JSON.stringify(payload))
}
