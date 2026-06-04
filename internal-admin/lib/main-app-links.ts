/**
 * Helpers for building handoff links from the admin app into the main crewlly.com app.
 *
 * These links carry an INTENT only (preselect an org + a mode). The main app
 * re-checks the user's grant and the organization on its own before starting any
 * session — the query params never authorize anything. The admin app must never
 * start an InternalAccessSession itself.
 */
export type InternalAccessLevel = "owner_view" | "employee_view"

function base(mainAppUrl: string): string {
  return mainAppUrl ? mainAppUrl.replace(/\/$/, "") : ""
}

/** Plain selector link (no preselect). */
export function selectorUrl(mainAppUrl: string): string {
  return `${base(mainAppUrl)}/internal`
}

/** Preselect link: opens the main app's /internal with an org + mode preselected. */
export function preselectUrl(
  mainAppUrl: string,
  organizationId: string,
  accessLevel: InternalAccessLevel,
): string {
  const params = new URLSearchParams({ organizationId, accessLevel })
  return `${base(mainAppUrl)}/internal?${params.toString()}`
}

export const LEVEL_BUTTON_LABEL: Record<InternalAccessLevel, string> = {
  owner_view: "Open as owner",
  employee_view: "Open as employee",
}
