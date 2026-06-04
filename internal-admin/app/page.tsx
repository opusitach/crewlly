/**
 * admin.crewlly.com root — redirects to the dashboard.
 *
 * The gate runs on /dashboard (and every other page). We redirect here rather
 * than rendering so there's a single canonical dashboard URL.
 */
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function AdminRootPage() {
  redirect("/dashboard")
}
