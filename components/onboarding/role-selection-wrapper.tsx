"use client"

import { useRouter } from "next/navigation"
import RoleSelectionScreen from "@/components/onboarding/role-selection-screen"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "@/lib/i18n/context"

export default function RoleSelectionWrapper() {
  const router = useRouter()
  const { toast } = useToast()
  const { t } = useTranslation()

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
        throw new Error(msg?.error || t("onboarding_role_save_failed"))
      }
      if (role === "owner") {
        router.push("/onboarding/owner")
      } else {
        router.push("/onboarding/employee")
      }
    } catch (error) {
      toast({
        title: t("common_error"),
        description: error instanceof Error ? error.message : t("onboarding_role_save_failed"),
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
