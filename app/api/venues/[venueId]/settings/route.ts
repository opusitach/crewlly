import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const buildKey = (venueId: string) => `venue-settings-${venueId}`

export async function GET(_: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params
  if (!venueId) {
    return NextResponse.json({ error: "venueId is required" }, { status: 400 })
  }
  const key = buildKey(venueId)
  const record = await prisma.appState.findUnique({ where: { key } })
  return NextResponse.json({ data: record?.data ?? null })
}

export async function PUT(request: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params
  if (!venueId) {
    return NextResponse.json({ error: "venueId is required" }, { status: 400 })
  }
  const key = buildKey(venueId)
  const json = await request.json()
  if (json?.data === undefined) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 })
  }

  const record = await prisma.appState.upsert({
    where: { key },
    create: { key, data: json.data },
    update: { data: json.data },
  })

  return NextResponse.json({ data: record.data })
}

