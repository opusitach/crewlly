import { requireAdminPageAccess } from "../../lib/admin-page"
import AdminShell from "../../components/admin-shell"
import Forbidden from "../../components/forbidden"
import OrganizationsView from "../../components/organizations-view"
import { isOrganizationInternalLevel } from "@/lib/types/internal-access"

export const dynamic = "force-dynamic"

export default async function OrganizationsPage() {
  const access = await requireAdminPageAccess()
  if (!access) return <Forbidden />

  const mainAppUrl = process.env.MAIN_APP_URL ?? process.env.NEXT_PUBLIC_MAIN_APP_URL ?? ""
  // Only owner_view / employee_view map to "Open as …" handoff links. super_admin
  // confers no organization access, so it never produces a button here.
  const orgLevels = access.enabledLevels.filter(isOrganizationInternalLevel)

  return (
    <AdminShell access={access}>
      <OrganizationsView mainAppUrl={mainAppUrl} enabledLevels={orgLevels} />
    </AdminShell>
  )
}
