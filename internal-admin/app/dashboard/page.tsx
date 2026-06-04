import { requireAdminPageAccess } from "../../lib/admin-page"
import AdminShell from "../../components/admin-shell"
import Forbidden from "../../components/forbidden"
import DashboardView from "../../components/dashboard-view"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const access = await requireAdminPageAccess()
  if (!access) return <Forbidden />

  return (
    <AdminShell access={access}>
      <DashboardView />
    </AdminShell>
  )
}
