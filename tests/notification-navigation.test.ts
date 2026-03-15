import { describe, expect, it } from "vitest"
import {
  parseNotificationNavigationTarget,
  resolveNotificationNavigationTarget,
  toNotificationDateOnly,
} from "../lib/notifications/navigation"

describe("notification navigation", () => {
  it("parses typed payload into navigation target", () => {
    expect(
      parseNotificationNavigationTarget({
        view: "owner_cash",
        cashTab: "review_queue",
        cashSessionId: "cash_1",
        workDate: "2026-03-08",
      }),
    ).toEqual({
      view: "owner_cash",
      cashTab: "review_queue",
      cashSessionId: "cash_1",
      workDate: "2026-03-08",
    })
  })

  it("falls back to worker planner target from legacy shift notification text", () => {
    expect(
      resolveNotificationNavigationTarget({
        title: "Создана смена",
        message: "Вам назначили смену (Бармен) на 18.02.2026, 09:00–18:00.",
      }),
    ).toEqual({
      view: "worker_planner",
      workDate: "2026-02-18",
      openWeekView: true,
    })
  })

  it("falls back to owner review queue for legacy auto-close notifications", () => {
    expect(
      resolveNotificationNavigationTarget({
        title: "Смена автоматически завершена",
        message:
          'Система автоматически завершила рабочую смену сотрудника Иван Петров (05.03.2026) после 24 часов в статусе "Идет".',
      }),
    ).toEqual({
      view: "owner_cash",
      cashTab: "review_queue",
      workDate: "2026-03-05",
    })
  })

  it("falls back to canceled owner shift details target from legacy cancel notification text", () => {
    expect(
      resolveNotificationNavigationTarget({
        title: "Отменена рабочая смена",
        message: "Иван Петров отменил(а) рабочую смену (21.02.2026). Причина: Сотрудник заболел",
      }),
    ).toEqual({
      view: "owner_shifts",
      workDate: "2026-02-21",
      preferCanceledInterval: true,
      cancelReason: "Сотрудник заболел",
    })
  })

  it("navigates worker bonus notification to money screen using explicit period payload", () => {
    expect(
      resolveNotificationNavigationTarget({
        title: "Начислен бонус",
        message: "Начислен бонус: 500 CZK. Комментарий: За инициативу",
        payload: {
          view: "worker_money",
          fromDate: "2026-03-01",
          toDate: "2026-03-15",
          adjustmentType: "bonus",
          effectiveDate: "2026-03-15",
        },
      }),
    ).toEqual({
      view: "worker_money",
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
    })
  })

  it("falls back to month period for legacy bonus notification payload without typed view", () => {
    expect(
      resolveNotificationNavigationTarget({
        title: "Начислен штраф",
        message: "Начислен штраф: 300 CZK. Комментарий: За опоздание",
        payload: {
          adjustmentType: "penalty",
          effectiveDate: "2026-03-15",
        },
      }),
    ).toEqual({
      view: "worker_money",
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })
  })

  it("normalizes Date values to yyyy-mm-dd", () => {
    expect(toNotificationDateOnly(new Date("2026-03-08T00:00:00.000Z"))).toBe("2026-03-08")
  })
})
