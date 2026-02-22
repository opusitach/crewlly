import { NextResponse } from "next/server"
import { z } from "zod"
import { createPresignedUploadUrl } from "@/lib/s3"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import { listCashRegisterFields } from "@/lib/cash/fields-query"

const payloadSchema = z.object({
  workIntervalId: z.string().uuid(),
  ruleId: z.string().uuid(),
  cashFieldKey: z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9_]{1,63}$/).optional(),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024).optional(),
})

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
])

const normalizeContentType = (value: string) => {
  const normalized = value.trim().toLowerCase().split(";")[0]?.trim() || ""
  if (normalized === "image/jpg" || normalized === "image/pjpeg") {
    return "image/jpeg"
  }
  return normalized
}

const parseHost = (value: string | null) => {
  if (!value) return null
  const candidate = value.split(",")[0]?.trim()
  if (!candidate) return null
  try {
    return new URL(`http://${candidate}`).host
  } catch {
    return null
  }
}

const isIpv4Hostname = (value: string) => {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false
  return value.split(".").every((part) => {
    const num = Number(part)
    return Number.isInteger(num) && num >= 0 && num <= 255
  })
}

const isIpHostname = (value: string) => {
  const normalized = value.replace(/^\[(.*)\]$/, "$1")
  return isIpv4Hostname(normalized) || normalized.includes(":")
}

const isPrivateOrLocalIpv4 = (value: string) => {
  if (!isIpv4Hostname(value)) return false
  const [a, b] = value.split(".").map(Number)
  if (a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

const isInternalHostname = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === "minio" || normalized === "localhost") return true
  if (normalized.endsWith(".local") || normalized.endsWith(".internal")) return true
  if (normalized === "::1") return true
  return isPrivateOrLocalIpv4(normalized)
}

const toOrigin = (value: string | undefined | null) => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return new URL(trimmed).origin
  } catch {
    const host = parseHost(trimmed)
    if (!host) return undefined
    const hostname = (() => {
      try {
        return new URL(`http://${host}`).hostname
      } catch {
        return host
      }
    })()
    const protocol = !isIpHostname(hostname) && hostname !== "localhost" ? "https:" : "http:"
    return `${protocol}//${host}`
  }
}

const resolveCaddyMinioOrigin = (request: Request) => {
  const configured = process.env.CADDY_MINIO_API_DOMAIN
  if (!configured) return undefined

  const fromUrl = toOrigin(configured)
  if (fromUrl) return fromUrl

  const host = parseHost(configured)
  if (!host) return undefined

  const requestAddress = resolveRequestAddress(request)
  const hostname = (() => {
    try {
      return new URL(`http://${host}`).hostname
    } catch {
      return host
    }
  })()

  const protocol =
    requestAddress.protocol === "http:" && !isIpHostname(hostname) && hostname !== "localhost"
      ? "https:"
      : requestAddress.protocol

  return `${protocol}//${host}`
}

const requiresPublicPresignEndpoint = () => {
  const internalEndpoint = process.env.AWS_S3_ENDPOINT
  if (!internalEndpoint) return false

  try {
    const parsed = new URL(internalEndpoint)
    return isInternalHostname(parsed.hostname)
  } catch {
    return false
  }
}

const isInternalOrigin = (origin: string) => {
  try {
    return isInternalHostname(new URL(origin).hostname)
  } catch {
    return false
  }
}

const resolveRequestAddress = (request: Request) => {
  const requestUrl = new URL(request.url)
  const host =
    parseHost(request.headers.get("x-forwarded-host")) ||
    parseHost(request.headers.get("host")) ||
    requestUrl.host
  const protocolHeader = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const protocol =
    protocolHeader === "http" || protocolHeader === "https"
      ? `${protocolHeader}:`
      : requestUrl.protocol
  const hostname = (() => {
    try {
      return new URL(`http://${host}`).hostname
    } catch {
      return requestUrl.hostname
    }
  })()

  return { host, protocol, hostname }
}

const resolvePresignEndpoint = (request: Request) => {
  const explicit = toOrigin(process.env.AWS_S3_PRESIGN_ENDPOINT)
  if (explicit && !isInternalOrigin(explicit)) return explicit

  const publicBase = process.env.AWS_S3_PUBLIC_BASE_URL
  if (publicBase) {
    try {
      const parsed = new URL(publicBase)
      const origin = `${parsed.protocol}//${parsed.host}`
      if (!isInternalOrigin(origin)) {
        return origin
      }
    } catch {
      // Ignore malformed URL and continue with fallback.
    }
  }

  const caddyMinioOrigin = resolveCaddyMinioOrigin(request)
  if (caddyMinioOrigin && !isInternalOrigin(caddyMinioOrigin)) return caddyMinioOrigin

  const internalEndpoint = process.env.AWS_S3_ENDPOINT
  if (!internalEndpoint) return undefined

  try {
    const endpointUrl = new URL(internalEndpoint)
    if (isInternalHostname(endpointUrl.hostname)) {
      // Do not fall back to the app request host (often app domain or raw IP).
      // That produces broken presigned URLs that point to the wrong service.
      return undefined
    }
    return endpointUrl.origin
  } catch {
    return undefined
  }
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null)
  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { workIntervalId, ruleId, cashFieldKey, contentType, sizeBytes } = parsed.data
  const normalizedContentType = normalizeContentType(contentType)
  if (!allowedContentTypes.has(normalizedContentType)) {
    return NextResponse.json(
      { error: "Unsupported content type. Use JPEG, PNG, WEBP, AVIF, GIF, HEIC or HEIF." },
      { status: 400 },
    )
  }
  if (sizeBytes && sizeBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large" }, { status: 400 })
  }

  const { interval, error, status } = await getAuthorizedInterval(workIntervalId)
  if (error || !interval) {
    return NextResponse.json({ error }, { status })
  }

  if (cashFieldKey) {
    const cashRule = await prisma.workIntervalProcedureRule.findFirst({
      where: {
        id: ruleId,
        type: "CASH",
        procedure: { workIntervalId },
      },
      select: {
        id: true,
        procedure: {
          select: {
            when: true,
          },
        },
      },
    })
    if (!cashRule) {
      return NextResponse.json({ error: "Cash rule is not found for this interval" }, { status: 404 })
    }

    const cashField = (
      await listCashRegisterFields(prisma, {
        locationId: interval.workday.locationId,
        key: cashFieldKey,
        isActive: true,
        inputStage: cashRule.procedure.when === "OPEN" ? "open" : "close",
      })
    ).find((field) => field.isPhotoRequired)
    if (!cashField) {
      return NextResponse.json({ error: "Поле кассы не найдено или фото для него не требуется" }, { status: 404 })
    }
  } else {
    const photoRule = await prisma.workIntervalProcedureRule.findFirst({
      where: {
        id: ruleId,
        type: "PHOTO",
        procedure: { workIntervalId },
      },
      select: { id: true },
    })
    if (!photoRule) {
      return NextResponse.json({ error: "Photo rule is not found for this interval" }, { status: 404 })
    }
  }

  const key = cashFieldKey
    ? `procedures/${interval.workday.organizationId}/${workIntervalId}/${ruleId}/${cashFieldKey}/${crypto.randomUUID()}`
    : `procedures/${interval.workday.organizationId}/${workIntervalId}/${ruleId}/${crypto.randomUUID()}`
  const presignEndpoint = resolvePresignEndpoint(request)
  if (!presignEndpoint && requiresPublicPresignEndpoint()) {
    return NextResponse.json(
      {
        error:
          "S3 public upload endpoint is not configured. Set AWS_S3_PRESIGN_ENDPOINT or AWS_S3_PUBLIC_BASE_URL (or CADDY_MINIO_API_DOMAIN).",
      },
      { status: 500 },
    )
  }
  const presigned = await createPresignedUploadUrl({
    key,
    contentType: normalizedContentType,
    presignEndpoint,
  })

  return NextResponse.json({
    data: {
      uploadUrl: presigned.url,
      key: presigned.key,
      publicUrl: presigned.publicUrl,
      contentType: normalizedContentType,
      maxUploadBytes: MAX_UPLOAD_BYTES,
    },
  })
}
