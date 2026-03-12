export type ProcedureActionWhen = "OPEN" | "CLOSE"

type RedirectOptions = {
  when: ProcedureActionWhen
  hasManagementAccess: boolean
}

export const shouldRedirectToAppAfterProcedureAction = ({ when, hasManagementAccess }: RedirectOptions) =>
  when === "CLOSE" || (when === "OPEN" && !hasManagementAccess)
