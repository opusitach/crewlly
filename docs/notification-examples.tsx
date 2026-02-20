// Примеры моковых уведомлений для обеих ролей

export const ownerNotifications = [
  {
    id: "1",
    type: "shift",
    title: "Смена отправлена на проверку",
    message: "Иван Петров завершил вечернюю смену и отправил отчёт",
    timestamp: "15 мин назад",
    status: "unread",
  },
  {
    id: "2",
    type: "cash",
    title: "Обнаружено расхождение в кассе",
    message: "Расхождение 250 ₽ по вечерней смене от 22.12.2024",
    timestamp: "2 часа назад",
    status: "unread",
  },
  {
    id: "3",
    type: "receipt",
    title: "Сотрудник загрузил чек",
    message: "Мария Смирнова добавила 3 новых чека в смену",
    timestamp: "3 часа назад",
    status: "read",
  },
  {
    id: "4",
    type: "system",
    title: "Смена подтверждена",
    message: "Выплаты и чаевые обновлены в балансе сотрудника",
    timestamp: "Вчера, 18:30",
    status: "read",
  },
]

export const workerNotifications = [
  {
    id: "1",
    type: "shift",
    title: "Смена подтверждена",
    message: "Ваша смена от 22.12 проверена и подтверждена владельцем",
    timestamp: "30 мин назад",
    status: "unread",
  },
  {
    id: "2",
    type: "money",
    title: "Начислены чаевые",
    message: "Добавлено 450 ₽ чаевых за дневную смену",
    timestamp: "1 час назад",
    status: "unread",
  },
  {
    id: "3",
    type: "shift",
    title: "Напоминание о смене",
    message: "Ваша смена начинается через 1 час (14:00)",
    timestamp: "2 часа назад",
    status: "unread",
  },
  {
    id: "4",
    type: "schedule",
    title: "Изменение в графике",
    message: "Смена 25.12 перенесена с 10:00 на 14:00",
    timestamp: "Вчера, 20:15",
    status: "read",
  },
  {
    id: "5",
    type: "system",
    title: "Важное объявление",
    message: "С 1 января новый порядок распределения чаевых",
    timestamp: "2 дня назад",
    status: "read",
  },
]
