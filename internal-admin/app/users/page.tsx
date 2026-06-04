import { requireAdminPageAccess } from "../../lib/admin-page"
import AdminShell from "../../components/admin-shell"
import Forbidden from "../../components/forbidden"
import UsersView from "../../components/users-view"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
  const access = await requireAdminPageAccess()
  if (!access) return <Forbidden />

  return (
    <AdminShell access={access}>
      <UsersView />
    </AdminShell>
  )
}
