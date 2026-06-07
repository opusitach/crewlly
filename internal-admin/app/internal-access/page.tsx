import { requireSuperAdminPageAccess } from "../../lib/admin-page"
import AdminShell from "../../components/admin-shell"
import Forbidden from "../../components/forbidden"
import InternalAccessView from "../../components/internal-access-view"

export const dynamic = "force-dynamic"

export default async function InternalAccessPage() {
  // Stricter than other pages: write feature → super_admin only. Read-only admins
  // and regular users get <Forbidden />; anonymous users are redirected to login.
  const access = await requireSuperAdminPageAccess()
  if (!access) return <Forbidden />

  return (
    <AdminShell access={access}>
      <InternalAccessView currentUserId={access.user.id} />
    </AdminShell>
  )
}
