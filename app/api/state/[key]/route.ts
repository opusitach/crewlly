import { NextResponse } from "next/server"

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!key) {
    return NextResponse.json({ error: "Key is required" }, { status: 400 })
  }
  return NextResponse.json({ error: "Deprecated endpoint" }, { status: 410 })
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
  return NextResponse.json({ error: "Deprecated endpoint" }, { status: 410 })
}


