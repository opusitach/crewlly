# Crewlly - Shift Management Application

Современное приложение для управления сменами и сотрудниками, построенное на Next.js, React, TypeScript и PostgreSQL.

## Особенности

### Режимы работы

- **Owner Mode**: Для владельцев заведений - полный контроль над организацией, сотрудниками, сменами
- **Worker Mode**: Для сотрудников - просмотр своих смен, отметка прихода/ухода

### Организации и локации

- Поддержка нескольких локаций в одной организации
- Настройка рабочих часов для каждой локации
- Управление должностями (Бармен, Официант, Менеджер и т.д.)

### Управление сменами

- Создание, редактирование и удаление смен
- Назначение сотрудников с указанием должности
- Гибкая настройка оплаты через pay components (почасовая, фиксированная, процент)
- Поддержка ночных смен (переход через полночь)
- Статусы: draft (черновик), published (опубликовано)

### RBAC (Роли и права доступа)

- **Owner** - полный доступ ко всем функциям
- **Manager** - управление сменами, сотрудниками, касса
- **Worker** - просмотр своих смен, отметка прихода/ухода

### Касса и чаевые

- Открытие/закрытие кассовых сессий
- Загрузка Z/X-отчётов
- Распределение чаевых (по часам, поровну, вручную)

### Календарь

- **Month View**: Сетка с chip-ами смен
- **Week View**: Timeline 6:00 - 2:00
- **Day View**: Детальный вид дня

## Быстрый старт

### Требования

- Node.js 18+
- PostgreSQL 14+
- pnpm (рекомендуется)

### Установка

```bash
# Клонировать репозиторий
git clone <repo-url>
cd crewlly-main

# Установить зависимости
pnpm install

# Создать .env файл
cp .env.example .env
# Отредактировать DATABASE_URL в .env
```

### Настройка базы данных

```bash
# Запустить PostgreSQL (с Docker)
docker-compose up -d db

# Применить миграции
pnpm prisma migrate deploy

# Или для development
pnpm prisma migrate dev

# Сгенерировать Prisma клиент
pnpm prisma generate
```

### Запуск

```bash
# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

Открыть [http://localhost:3000](http://localhost:3000)

## Структура базы данных

Все данные хранятся в PostgreSQL (source of truth). **Моковые данные не используются.**

## Pay components

Комбинированная оплата сотрудников хранится в отдельных таблицах:

- `employee_pay_components` — дефолтные компоненты оплаты сотрудника.
- `work_interval_pay_components` — кастомные компоненты для конкретного интервала.
- `work_intervals.use_custom_pay` — переключатель источника расчёта.

Правила override:

- `use_custom_pay = false` → берём компоненты из `employee_pay_components`.
- `use_custom_pay = true` → берём компоненты из `work_interval_pay_components` (полный override).

Типы компонентов и формулы:

- `hourly`: `amount_cents * minutes_worked / 60`
- `fixed_shift`: `+ amount_cents`
- `percent_revenue`: `+ revenue_cents * rate_bp / 10000`

Примечание: для `percent_revenue` используется выручка, рассчитанная на уровне workday
(сумма полей кассы с флагом `is_revenue_basis`, распределяется пропорционально минутам).

Legacy поля (`employees.pay_type`, `employees.default_*`, `employees.percent_revenue_bp`,
`work_intervals.custom_*`) остаются для совместимости, но источником правды являются pay components.

### Основные таблицы

| Таблица | Описание |
|---------|----------|
| `organizations` | Организации |
| `locations` | Локации |
| `users` | Пользователи |
| `employees` | Сотрудники |
| `positions` | Должности |
| `workdays` | Рабочие дни |
| `work_intervals` | Интервалы работы |
| `time_entries` | Отметки прихода/ухода |

### Конвенции

- Денежные значения хранятся **в центах** (350 CZK = 35000)
- Проценты хранятся в **basis points** (15% = 1500 bp)
- Все timestamp'ы с timezone (`TIMESTAMPTZ`)

Подробнее: [docs/DATABASE.md](docs/DATABASE.md)

## API Endpoints

### Авторизация

- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `POST /api/auth/logout` - Выход
- `GET /api/auth/me` - Текущий пользователь

### Данные

- `GET/POST /api/employees` - Сотрудники
- `GET/POST /api/positions` - Должности
- `GET/POST /api/locations` - Локации
- `GET/POST /api/workdays` - Рабочие дни
- `GET/POST/PUT/DELETE /api/intervals` - Интервалы работы
- `POST /api/clock` - Отметка прихода/ухода

### Онбординг

- `POST /api/user/role` - Выбор режима (owner/worker)
- `POST /api/onboarding/owner` - Онбординг владельца

## Тесты

```bash
# Unit и интеграционные тесты
pnpm test

# E2E тесты
pnpm test:e2e

# Только тесты БД
pnpm test tests/database-integration.test.ts
```

## Технологии

- **Framework**: Next.js 16 + App Router
- **UI**: React 19, Tailwind CSS v4
- **Components**: Radix UI, shadcn/ui
- **State**: Zustand
- **Database**: PostgreSQL + Prisma
- **Auth**: Session-based (bcrypt)
- **Types**: TypeScript
- **Dates**: date-fns

## Структура проекта

```
├── app/
│   ├── api/                    # API routes
│   │   ├── auth/               # Авторизация
│   │   ├── employees/          # Сотрудники
│   │   ├── workdays/           # Рабочие дни
│   │   ├── intervals/          # Интервалы
│   │   └── ...
│   ├── shifts/                 # Страница смен
│   ├── workday/                # Страница рабочего дня
│   └── ...
├── components/
│   ├── shifts/                 # Компоненты смен
│   ├── workday/                # Компоненты рабочего дня
│   ├── onboarding/             # Онбординг
│   └── ui/                     # shadcn компоненты
├── lib/
│   ├── types/                  # TypeScript типы
│   ├── store/                  # Zustand stores
│   ├── api/                    # API клиенты
│   └── auth.ts                 # Авторизация
├── prisma/
│   ├── schema.prisma           # Схема БД
│   └── migrations/             # SQL миграции
└── tests/                      # Тесты
```

## Docker

```bash
# Все сервисы (frontend + backend + db + pgadmin)
docker-compose up -d

# Production (frontend + backend + db + minio + migrate)
cp docker/prod.env.example .env.production
# отредактируйте секреты и публичные URL в .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# Development with hot reload (frontend/backend)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Только БД
docker-compose up -d db

# pgAdmin для управления БД
docker-compose up -d pgadmin
# Открыть http://localhost:5050
# Login: admin@local.test / admin
```

## Прод-деплой

Новая схема прод-деплоя разделена на 3 compose-файла:

- `compose.data.yml` — `db`, `minio`, `pgadmin` (редкие изменения)
- `compose.app.yml` — `front`, `back` (+ one-shot `migrate`)
- `compose.caddy.yml` — `caddy` (редкие роутинговые изменения)

`Caddyfile` хранится в git по пути `infra/caddy/Caddyfile`, а секреты/пароли передаются через `.env.production`.

Целевая структура (deploy-oriented):

```text
/
├─ front/                 # placeholder для будущего split (код пока общий в корне)
├─ back/                  # placeholder для будущего split (код пока общий в корне)
├─ infra/
│  ├─ caddy/
│  │  └─ Caddyfile
│  ├─ db/
│  ├─ minio/
│  │  ├─ cors.json
│  │  └─ minio-init.sh
│  └─ pgadmin/
│     └─ servers.json
├─ compose.app.yml
├─ compose.caddy.yml
├─ compose.data.yml
├─ .env.example
└─ .github/workflows/
```

### 1) Первый запуск: создать общую сеть

```bash
docker network create app_net
```

### 2) Создать `.env.production` на сервере

```bash
cp .env.example .env.production
# заполните реальные значения (пароли, домены, caddy basic auth hashes)
```

Примечание:
- `.env.production` не коммитится (игнорируется git)
- для Caddy хеши паролей генерируются локально/на сервере и вставляются в `.env.production`
- значения `BASIC_AUTH_USER*_HASH` содержат символы `$`, поэтому в `.env.production`
  оборачивайте их в одинарные кавычки (или экранируйте `$` как `$$`), иначе `docker compose`
  попытается интерполировать их как переменные и Caddy уйдёт в restart loop

### 3) Первый запуск (по порядку)

```bash
# 1. Data services
docker compose --env-file .env.production -f compose.data.yml up -d db minio pgadmin

# (опционально, один раз) инициализация bucket/CORS для MinIO
docker compose --env-file .env.production -f compose.data.yml run --rm minio-init

# 2. App services (front/back + миграции)
docker compose --env-file .env.production -f compose.app.yml up -d --build front back

# 3. Caddy reverse proxy
docker compose --env-file .env.production -f compose.caddy.yml up -d caddy
```

### 4) Проверка Caddy конфигурации вручную

```bash
docker compose --env-file .env.production -f compose.caddy.yml exec caddy caddy validate --config /etc/caddy/Caddyfile
```

### 5) Генерация хеша пароля для Caddy Basic Auth

```bash
caddy hash-password --plaintext 'PASSWORD'
```

### GitHub Actions (выборочный деплой)

В репозитории есть 3 workflow:

- `deploy-app.yml` — деплоит только `front/back`
- `deploy-caddy.yml` — деплоит/валидирует/reload только `caddy`
- `deploy-data.yml` — деплоит только `db/minio/pgadmin`

Все workflow работают через SSH, не делают `docker compose down` и не используют `--no-cache` в обычном деплое.

### Legacy compose

Старые `docker-compose.yml` и `docker-compose.prod.yml` оставлены временно как legacy для совместимости, но новые workflow их не используют.

## Contributing

1. Создайте branch от `main`
2. Внесите изменения
3. Убедитесь что тесты проходят: `pnpm test`
4. Создайте Pull Request

## License

MIT
