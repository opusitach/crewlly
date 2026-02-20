"use client"

import { useRouter } from "next/navigation"
import RoleSelectionScreen from "@/components/onboarding/role-selection-screen"
import { useToast } from "@/hooks/use-toast"

export default function RoleSelectionWrapper() {
  const router = useRouter()
  const { toast } = useToast()

  const chooseRole = async (role: "owner" | "worker") => {
    try {
      const res = await fetch("/api/user/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryMode: role }),
        credentials: "include",
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || "Не удалось сохранить роль")
      }
      if (role === "owner") {
        router.push("/onboarding/owner")
      } else {
        router.push("/onboarding/employee")
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить роль",
        variant: "destructive",
      })
    }
  }

  return (
    <RoleSelectionScreen
      onSelectOwner={() => chooseRole("owner")}
      onSelectWorker={() => chooseRole("worker")}
    />
  )
}
