"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { ShiftsPageSkeleton } from "@/components/ui/page-skeletons"

const ShiftsView = dynamic(() => import("@/components/shifts-view"), {
  ssr: false,
  loading: () => <ShiftsPageSkeleton />,
})

export default function ShiftPlannerPage() {
  const router = useRouter()
  return <ShiftsView onBack={() => router.back()} />
}
