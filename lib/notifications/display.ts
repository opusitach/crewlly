import type { Language } from "@/lib/i18n/translations"

const notificationTitleTranslations: Record<string, string> = {
  "Открыта рабочая смена": "Work shift opened",
  "Закрыта рабочая смена": "Work shift closed",
  "Отменена рабочая смена": "Work shift cancelled",
  "Открыта кассовая смена": "Cash shift opened",
  "Закрыта кассовая смена": "Cash shift closed",
  "Создана смена": "Shift created",
  "Смена автоматически завершена": "Shift auto-completed",
  "Начислен бонус": "Bonus added",
  "Начислен штраф": "Penalty added",
  "Изменение зарплаты": "Pay changed",
  "Изменены фактические часы смены": "Actual shift hours changed",
}

const replacementPairs: Array<[string, string]> = [
  ["открыл(а) рабочую смену", "opened a work shift"],
  ["закрыл(а) рабочую смену", "closed a work shift"],
  ["отменил(а) рабочую смену", "cancelled a work shift"],
  ["открыл(а) кассовую смену", "opened a cash shift"],
  ["закрыл(а) кассовую смену", "closed a cash shift"],
  ["Система автоматически завершила рабочую смену сотрудника", "The system automatically completed the work shift for"],
  ["после 18 часов в статусе \"Идет\"", "after 18 hours in “In progress” status"],
  ["Время завершения:", "Completed at:"],
  ["Вам назначили смену", "You have been assigned a shift"],
  ["Ваша зарплата была изменена с", "Your pay was changed from"],
  ["Владелец изменил фактическое время вашей смены на", "The owner changed your actual shift time on"],
  ["Причина:", "Reason:"],
  ["на проверке", "pending review"],
  ["рабочую смену", "work shift"],
  ["кассовую смену", "cash shift"],
  ["Касса", "Cash register"],
]

const replaceAllText = (value: string, search: string, replacement: string) => value.split(search).join(replacement)

export const translateNotificationText = (value: string, language: Language) => {
  if (language !== "en") return value
  const direct = notificationTitleTranslations[value]
  if (direct) return direct

  return replacementPairs.reduce(
    (translated, [search, replacement]) => replaceAllText(translated, search, replacement),
    value,
  )
}

export const translateNotificationMessage = (message: string, title: string, language: Language) => {
  if (language !== "en") return message

  if (title === "Создана смена") {
    const match = /^Вам назначили смену(.*?) на (.+)\.$/u.exec(message)
    if (match) {
      const [, positionLabel, dateAndTime] = match
      return `You have been assigned a shift${positionLabel} on ${dateAndTime}.`
    }
  }

  if (title === "Изменение зарплаты") {
    const match = /^Ваша зарплата была изменена с (.+) на (.+)\.$/u.exec(message)
    if (match) {
      const [, beforeLabel, afterLabel] = match
      const translatePayLabel = (label: string) =>
        label
          .replace("не указана", "not set")
          .replace("не указан", "not set")
          .replace("/ч", "/h")
      return `Your pay was changed from ${translatePayLabel(beforeLabel)} to ${translatePayLabel(afterLabel)}.`
    }
  }

  if (title === "Изменены фактические часы смены") {
    const match = /^Владелец изменил фактическое время вашей смены на (.+?): (.+?)–(.+?)\. Причина: (.+)$/u.exec(message)
    if (match) {
      const [, dateLabel, openedTime, closedTime, reason] = match
      return `The owner changed your actual shift time on ${dateLabel}: ${openedTime}-${closedTime}. Reason: ${reason}`
    }
  }

  return translateNotificationText(message, language)
}
