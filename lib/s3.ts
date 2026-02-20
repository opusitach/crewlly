import { DeleteObjectCommand, S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const region = process.env.AWS_REGION || process.env.AWS_S3_REGION
const bucket = process.env.AWS_S3_BUCKET
const publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL
const endpoint = process.env.AWS_S3_ENDPOINT
const presignEndpointFromEnv = process.env.AWS_S3_PRESIGN_ENDPOINT || endpoint

if (!region) {
  console.warn("[s3] AWS_REGION is not set")
}
if (!bucket) {
  console.warn("[s3] AWS_S3_BUCKET is not set")
}

const credentials = process.env.AWS_ACCESS_KEY_ID
  ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    }
  : undefined

const createClient = (clientEndpoint?: string) =>
  new S3Client({
    region,
    endpoint: clientEndpoint,
    forcePathStyle: Boolean(clientEndpoint),
    credentials,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })

const objectClient = createClient(endpoint)
const presignClientCache = new Map<string, S3Client>()

const getPresignClient = (overrideEndpoint?: string) => {
  const resolvedEndpoint = overrideEndpoint || presignEndpointFromEnv
  const cacheKey = resolvedEndpoint ?? "__default__"
  const cached = presignClientCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const client = createClient(resolvedEndpoint)
  presignClientCache.set(cacheKey, client)
  return client
}

export async function createPresignedUploadUrl(params: {
  key: string
  contentType: string
  expiresInSeconds?: number
  presignEndpoint?: string
}) {
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is not configured")
  }
  if (!region) {
    throw new Error("AWS_REGION is not configured")
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    ContentType: params.contentType,
  })

  const presignClient = getPresignClient(params.presignEndpoint)
  const url = await getSignedUrl(presignClient, command, { expiresIn: params.expiresInSeconds ?? 300 })
  const trimmedBase = publicBaseUrl?.replace(/\/$/, "")
  const publicUrl = trimmedBase ? `${trimmedBase}/${params.key}` : null

  return { url, key: params.key, publicUrl }
}

export async function deleteObjectByKey(key: string) {
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is not configured")
  }
  if (!region) {
    throw new Error("AWS_REGION is not configured")
  }

  await objectClient.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
}
