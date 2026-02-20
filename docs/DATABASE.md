# Crewlly Database Setup (PostgreSQL)

Это руководство описывает настройку PostgreSQL для Crewlly.

## Предварительные требования

- PostgreSQL 14+ 
- Node.js 18+
- pnpm (или npm)

## Быстрый старт

### 1. Запуск PostgreSQL

**С Docker Compose (рекомендуется):**

```bash
docker-compose up -d db
```

**Или локально:**

Убедитесь, что PostgreSQL запущен и создайте базу данных:

```bash
createdb crewlly
```

### 2. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crewlly?schema=public"
```

### 3. Применение миграций

```bash
# Генерация Prisma клиента
pnpm prisma generate

# Применение миграций
pnpm prisma migrate deploy

# Или для development (создаёт миграции автоматически)
pnpm prisma migrate dev
```

### 4. Проверка

```bash
# Открыть Prisma Studio для просмотра данных
pnpm prisma studio

# Запустить тесты базы данных
pnpm test tests/database-integration.test.ts
```

## Структура базы данных (Crewlly DB v2)

### Основные таблицы

| Таблица | Описание |
|---------|----------|
| `organizations` | Организации (заведения) |
| `locations` | Локации внутри организации |
| `users` | Пользователи (владельцы и сотрудники) |
| `employees` | Сотрудники с привязкой к организации |
| `positions` | Должности (Бармен, Официант и т.д.) |
| `workdays` | Рабочие дни (контейнер для интервалов) |
| `work_intervals` | Интервалы работы сотрудников |
| `time_entries` | Отметки прихода/ухода |

### RBAC (Роли и права доступа)

| Таблица | Описание |
|---------|----------|
| `access_roles` | Роли доступа (owner, manager, worker) |
| `access_permissions` | Каталог прав |
| `access_role_permissions` | Связь ролей и прав |
| `organization_members` | Членство пользователей в организациях |

### Финансы

| Таблица | Описание |
|---------|----------|
| `cash_registers` | Кассы локаций |
| `cash_sessions` | Кассовые сессии (открытие/закрытие) |
| `receipt_uploads` | Загруженные чеки |
| `tips_pools` | Пулы чаевых |
| `tip_allocations` | Распределение чаевых |
| `payroll_runs` | Расчётные периоды |
| `payroll_items` | Строки расчёта зарплаты |

## Конвенции хранения данных

### Денежные значения

Все денежные значения хранятся **в центах (копейках)**:

```
350 CZK → 35000 cents
12.50 CZK → 1250 cents
```

### Проценты

Проценты хранятся в **basis points** (bp):

```
15% → 1500 bp
3.5% → 350 bp
0.1% → 10 bp
```

### Даты и время

- Все временные метки в `TIMESTAMPTZ` (с timezone)
- Даты рабочих дней в `DATE`
- Время работы локаций в `TIME`

## Миграции

### Создание новой миграции

```bash
# После изменения schema.prisma
pnpm prisma migrate dev --name описание_изменения
```

### Откат миграции

```bash
# Просмотр статуса
pnpm prisma migrate status

# Сброс базы (ОСТОРОЖНО - удаляет все данные!)
pnpm prisma migrate reset
```

### Продакшн

```bash
# Применить миграции без интерактивного режима
pnpm prisma migrate deploy
```

## Проверка данных

### Поиск моковых данных

В проекте не должно быть моковых/захардкоженных данных. Проверка:

```bash
# Поиск в коде
grep -r "seedEmployees\|seedShifts\|mock\|Mock" --include="*.ts" --include="*.tsx" lib/ components/

# Поиск в базе
psql $DATABASE_URL -c "SELECT * FROM employees WHERE employee_code LIKE 'emp-%';"
```

### Проверка целостности

```sql
-- Проверка сирот (employees без users)
SELECT e.id FROM employees e 
LEFT JOIN users u ON e.user_id = u.id 
WHERE u.id IS NULL;

-- Проверка интервалов без workday
SELECT wi.id FROM work_intervals wi 
LEFT JOIN workdays w ON wi.workday_id = w.id 
WHERE w.id IS NULL;

-- Проверка пустых организаций
SELECT o.id, o.name FROM organizations o 
LEFT JOIN locations l ON o.id = l.organization_id 
WHERE l.id IS NULL;
```

## Резервное копирование

```bash
# Создать backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Восстановить
psql $DATABASE_URL < backup_20260103.sql
```

## Troubleshooting

### Ошибка подключения

```
Error: P1001 Can't reach database server
```

Проверьте:
1. PostgreSQL запущен
2. `DATABASE_URL` корректен
3. Порт не заблокирован

### Ошибка миграции

```
Error: P3009 migrate found failed migrations
```

Решение:
```bash
pnpm prisma migrate resolve --rolled-back MIGRATION_NAME
# или
pnpm prisma migrate reset
```

### Сброс Prisma клиента

```bash
rm -rf node_modules/.prisma
pnpm prisma generate
```
