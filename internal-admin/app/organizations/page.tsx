import { requireAdminPageAccess } from "../../lib/admin-page"
import AdminShell from "../../components/admin-shell"
import Forbidden from "../../components/forbidden"
import OrganizationsView from "../../components/organizations-view"

export const dynamic = "force-dynamic"

export default async function OrganizationsPage() {
  const access = await requireAdminPageAccess()
  if (!access) return <Forbidden />

  const mainAppUrl = process.env.MAIN_APP_URL ?? process.env.NEXT_PUBLIC_MAIN_APP_URL ?? ""

  return (
    <AdminShell access={access}>
      <OrganizationsView mainAppUrl={mainAppUrl} enabledLevels={access.enabledLevels} />
    </AdminShell>
  )
}
