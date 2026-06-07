import { requireAdminPageAccess } from "../../../lib/admin-page"
import AdminShell from "../../../components/admin-shell"
import Forbidden from "../../../components/forbidden"
import OrganizationDetailView from "../../../components/organization-detail-view"
import { isOrganizationInternalLevel } from "@/lib/types/internal-access"

export const dynamic = "force-dynamic"

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const access = await requireAdminPageAccess()
  if (!access) return <Forbidden />

  const { id } = await params
  const mainAppUrl = process.env.MAIN_APP_URL ?? process.env.NEXT_PUBLIC_MAIN_APP_URL ?? ""
  const orgLevels = access.enabledLevels.filter(isOrganizationInternalLevel)

  return (
    <AdminShell access={access}>
      <OrganizationDetailView id={id} mainAppUrl={mainAppUrl} enabledLevels={orgLevels} />
    </AdminShell>
  )
}
