import type {
  ProcedureRuleType,
  WorkIntervalProcedureAnswer,
  WorkIntervalProcedureRule,
  WorkIntervalProcedureRuleChecklistItem,
} from "@prisma/client"

type RuleWithItems = WorkIntervalProcedureRule & { checklistItems: WorkIntervalProcedureRuleChecklistItem[] }
type AnswerWithItems = WorkIntervalProcedureAnswer & { checklistItems: { itemId: string; isChecked: boolean }[] }

const isChecklistComplete = (rule: RuleWithItems, answer?: AnswerWithItems | null) => {
  if (rule.checklistItems.length === 0) return false
  const checkedByItem = new Map(answer?.checklistItems.map((item) => [item.itemId, item.isChecked]) ?? [])
  return rule.checklistItems.every((item) => checkedByItem.get(item.id) === true)
}

const isInputComplete = (answer?: AnswerWithItems | null) => {
  const value = answer?.inputValue ?? ""
  return value.trim().length > 0
}

const isPhotoComplete = (answer?: AnswerWithItems | null) => {
  return Boolean(answer?.photoS3Key || answer?.photoUrl)
}

const isCashComplete = () => true

export const isRuleComplete = (
  rule: RuleWithItems,
  answer?: AnswerWithItems | null,
) => {
  const type: ProcedureRuleType = rule.type
  if (type === "CHECKLIST") return isChecklistComplete(rule, answer)
  if (type === "INPUT") return isInputComplete(answer)
  if (type === "PHOTO") return isPhotoComplete(answer)
  if (type === "CASH") return isCashComplete()
  return false
}

export const getRequiredCompletion = (
  rules: RuleWithItems[],
  answersByRuleId: Map<string, AnswerWithItems | null>,
  options?: { treatAllAsRequired?: boolean },
) => {
  const requiredRules = options?.treatAllAsRequired ? rules : rules.filter((rule) => rule.required)
  const completedRequired = requiredRules.filter((rule) => isRuleComplete(rule, answersByRuleId.get(rule.id) ?? null))
  return {
    requiredTotal: requiredRules.length,
    requiredCompleted: completedRequired.length,
    missingRequired: requiredRules
      .filter((rule) => !isRuleComplete(rule, answersByRuleId.get(rule.id) ?? null))
      .map((rule) => rule.id),
  }
}
