export const PLANNED_STATUSES = new Set(["scheduled"])
export const OPENED_STATUSES = new Set(["in_progress"])
export const CLOSED_STATUSES = new Set(["completed", "canceled"])

export const isPlannedStatus = (status: string) => PLANNED_STATUSES.has(status)
export const isOpenedStatus = (status: string) => OPENED_STATUSES.has(status)
export const isClosedStatus = (status: string) => CLOSED_STATUSES.has(status)
