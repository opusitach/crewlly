import { requireAdminPageAccess } from "../../lib/admin-page"
import AdminShell from "../../components/admin-shell"
import Forbidden from "../../components/forbidden"
import AuditLogsView from "../../components/audit-logs-view"

export const dynamic = "force-dynamic"

export default async function AuditLogsPage() {
  const access = await requireAdminPageAccess()
  if (!access) return <Forbidden />

  return (
    <AdminShell access={access}>
      <AuditLogsView />
    </AdminShell>
  )
}
