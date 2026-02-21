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

const parseHostname = (value: string | null) => {
  if (!value) return null
  const candidate = value.split(",")[0]?.trim()
  if (!candidate) return null
  try {
    return new URL(`http://${candidate}`).hostname
  } catch {
    return null
  }
}

const resolvePresignEndpoint = (request: Request) => {
  const explicit = process.env.AWS_S3_PRESIGN_ENDPOINT
  if (explicit) return explicit

  const publicBase = process.env.AWS_S3_PUBLIC_BASE_URL
  if (publicBase) {
    try {
      const parsed = new URL(publicBase)
      return `${parsed.protocol}//${parsed.host}`
    } catch {
      // Ignore malformed URL and continue with fallback.
    }
  }

  const internalEndpoint = process.env.AWS_S3_ENDPOINT
  if (!internalEndpoint) return undefined

  try {
    const endpointUrl = new URL(internalEndpoint)
    if (endpointUrl.hostname === "minio") {
      const requestHostname =
        parseHostname(request.headers.get("x-forwarded-host")) ||
        parseHostname(request.headers.get("host")) ||
        new URL(request.url).hostname
      endpointUrl.hostname = requestHostname
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
      maxUploadBytes: MAX_UPLOAD_BYTES,
    },
  })
}
