import { requireAdminPageAccess } from "../../../lib/admin-page"
import AdminShell from "../../../components/admin-shell"
import Forbidden from "../../../components/forbidden"
import UserDetailView from "../../../components/user-detail-view"

export const dynamic = "force-dynamic"

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireAdminPageAccess()
  if (!access) return <Forbidden />

  const { id } = await params

  return (
    <AdminShell access={access}>
      <UserDetailView id={id} />
    </AdminShell>
  )
}
