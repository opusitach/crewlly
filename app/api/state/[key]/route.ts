import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!key) {
    return NextResponse.json({ error: "Key is required" }, { status: 400 })
  }
  const record = await prisma.appState.findUnique({ where: { key } })
  return NextResponse.json({ data: record?.data ?? null })
}

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!key) {
    return NextResponse.json({ error: "Key is required" }, { status: 400 })
  }
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



