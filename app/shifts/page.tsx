"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"

const ShiftsView = dynamic(() => import("@/components/shifts-view"), { ssr: false })

export default function ShiftsPage() {
  const router = useRouter()
  return <ShiftsView onBack={() => router.back()} />
}
