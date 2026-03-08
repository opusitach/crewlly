# Security Best Practices Review: `crewlly-main`

## Executive Summary

Проверен стек `Next.js 16 / React 19 / TypeScript / Prisma / PostgreSQL / Caddy`.

Главный вывод: самые серьёзные риски здесь не в XSS или SQL injection, а в границах доступа. В кодовой базе есть:

- публичные unauthenticated endpoints для `appState`,
- системные пропуски RBAC на management/scheduling API,
- избыточная выдача чувствительных данных любому участнику организации,
- подробные внутренние ошибки, которые возвращаются клиенту,
- отсутствие видимого rate limiting для auth/invite flows,
- отсутствие видимого baseline security headers на app/API уровне.

Критичных подтверждённых проблем: `2`  
High: `2`  
Medium: `2`  
Low: `1`

Обзор выполнялся без изменения рабочего кода и без изменения runtime-конфигурации. В репозиторий добавлен только этот отчёт.

## Scope And Method

- Просмотрены `app/api/**`, `lib/**`, `next.config.mjs`, `Dockerfile`, `compose*.yml`, `infra/caddy/Caddyfile`, `prisma/schema.prisma`.
- Для security guidance использованы локальные reference-файлы skill:
  - `javascript-typescript-nextjs-web-server-security.md`
  - `javascript-typescript-react-web-frontend-security.md`
  - `javascript-general-web-frontend-security.md`
- Проверялись: auth/authz, cookies/sessions, secrets/env, XSS sinks, uploads, internal routes, error handling, reverse proxy posture, secure defaults.

## Critical Findings

### CRWL-SEC-001

- Rule ID: `CRWL-SEC-001`
- Severity: `Critical`
- Location:
  - `app/api/state/[key]/route.ts:4-30`
  - `app/api/venues/[venueId]/settings/route.ts:6-34`
  - `prisma/schema.prisma:949-956`
  - `infra/caddy/Caddyfile:18-35`
- Impact: любой внешний пользователь может читать и переписывать произвольное содержимое `app_states` без аутентификации.

#### Evidence

Оба route handler'а работают без `getSessionUser()` / `getSessionUserWithOrg()` и без любой проверки роли:

- `app/api/state/[key]/route.ts:4-10` читает `appState` по произвольному ключу.
- `app/api/state/[key]/route.ts:13-29` делает `upsert` по произвольному ключу.
- `app/api/venues/[venueId]/settings/route.ts:6-13` читает legacy venue settings.
- `app/api/venues/[venueId]/settings/route.ts:16-33` делает `upsert` тех же данных.

При этом `AppState.data` хранится как произвольный `Json`:

- `prisma/schema.prisma:949-956`

А API домен в Caddy заведомо публикует `/api/*` наружу без дополнительной защиты на proxy-слое:

- `infra/caddy/Caddyfile:18-35`

#### Impact Details

- Неавторизованный пользователь может подменять системное/legacy состояние.
- Такой endpoint удобно использовать для тихой порчи данных, feature state hijack и persistence.
- Даже если часть legacy-маршрутов сейчас не используется UI, они остаются reachable и writable.

#### Secure-By-Default Fix

- Немедленно закрыть оба endpoint'а аутентификацией.
- Для `PUT` добавить авторизацию по роли/permission, минимум `owner/manager`.
- Для legacy `/api/venues/[venueId]/settings`:
  - либо удалить,
  - либо ограничить чтение/запись владельцами организации,
  - либо вынести behind explicit admin feature flag.
- Добавить allowlist допустимых ключей, если `appState` должен жить дальше.

#### Regression-Safe Rollout

- Сначала добавить audit logging на чтение/запись этих ключей.
- Затем перевести `PUT` в режим `401/403` для всех без роли.
- После проверки usage удалить legacy route или ограничить allowlist.

#### False Positive Notes

- Даже если сейчас эти маршруты не вызываются UI, проблема остаётся: код делает endpoint публичным и writable.

---

### CRWL-SEC-002

- Rule ID: `CRWL-SEC-002`
- Severity: `Critical`
- Location:
  - `app/api/organizations/route.ts:46-64`
  - `app/api/locations/route.ts:39-79`
  - `app/api/workdays/route.ts:169-221`
  - `app/api/intervals/route.ts:431-706`
  - `app/api/intervals/route.ts:709-1017`

#### Evidence

Во всех перечисленных маршрутах есть только проверка факта membership:

- `const session = await getSessionUserWithOrg()`
- `if (!session || !session.organization) return 401`

Но нет ни `isOwnerRole`, ни `isOwnerOrManagerRole`, ни `hasPermission(...)`.

Конкретно:

- `app/api/organizations/route.ts:46-61` позволяет любому участнику организации менять `name`, `timezone`, `currency`.
- `app/api/locations/route.ts:39-78` позволяет любому участнику создавать новые локации и кассовые регистры.
- `app/api/workdays/route.ts:169-209` позволяет любому участнику создавать рабочие дни.
- `app/api/intervals/route.ts:431-705` позволяет любому участнику создавать интервалы и задавать pay-related поля (`useCustomPay`, `customHourlyRateCents`, `customShiftRateCents`, `customPercentRevenueBp`, `revenueCents`).
- `app/api/intervals/route.ts:709-1017` позволяет любому участнику обновлять или удалять интервалы.

#### Impact Details

- Любой worker внутри организации может выполнять действия owner/manager уровня.
- Это прямой privilege escalation внутри tenant-а.
- На практике это позволяет:
  - переименовывать организацию,
  - менять timezone/currency,
  - создавать/менять/удалять смены,
  - менять pay-related данные по интервалам,
  - влиять на payroll и operational reporting.

#### Secure-By-Default Fix

- Вынести централизованный guard, например:
  - `requireOrgRole(session, ["owner", "manager"])`
  - или `requirePermission(session, "schedule:manage")`
- Закрыть mutating endpoints по принципу deny-by-default:
  - `organizations.PUT`
  - `locations.POST`
  - `workdays.POST`
  - `intervals.POST/PUT/DELETE`
- После фикса добавить regression tests на negative paths для worker-role.

#### Regression-Safe Rollout

1. Сначала добавить явные 403 checks.
2. Прогнать e2e/contract flows для owner/manager UI.
3. Для legacy/unknown consumers временно логировать отклонённые запросы, чтобы увидеть неожиданный usage.

#### False Positive Notes

- UI может скрывать кнопки от worker'ов, но это не является security boundary: route reachable напрямую через HTTP.

## High Findings

### CRWL-SEC-003

- Rule ID: `CRWL-SEC-003`
- Severity: `High`
- Location:
  - `app/api/invitations/route.ts:13-63`
  - `app/api/invitations/route.ts:163-191`
  - `infra/caddy/Caddyfile:18-35`

#### Evidence

`GET /api/invitations` и `DELETE /api/invitations` проверяют только membership:

- `app/api/invitations/route.ts:13-17`
- `app/api/invitations/route.ts:163-167`

В отличие от `POST`, где permission проверяется явно:

- `app/api/invitations/route.ts:71-75`

Кроме того, `GET` возвращает raw invitation token:

- `app/api/invitations/route.ts:49-61`
- поле `token: inv.token`

`DELETE` позволяет удалить pending invite без permission check:

- `app/api/invitations/route.ts:176-188`

#### Impact Details

- Любой участник организации может читать email'ы приглашений и raw invite tokens.
- Любой участник организации может отзывать чужие приглашения.
- Raw token даёт возможность перехватить invite flow и передать ссылку третьему лицу.

#### Secure-By-Default Fix

- Применить ту же permission-модель к `GET` и `DELETE`, что уже используется в `POST`.
- Не возвращать raw invitation token в списковом API.
- Вместо token возвращать:
  - masked value,
  - derived status,
  - `inviteUrl` только при создании,
  - либо one-time reveal flow.

#### Mitigation

- Пока фикс не выкатили, ограничить доступ к invitation management минимум до owner/manager через middleware/helper.

#### False Positive Notes

- Даже если UI не показывает экран приглашений worker'у, endpoint позволяет вызвать его напрямую.

---

### CRWL-SEC-004

- Rule ID: `CRWL-SEC-004`
- Severity: `High`
- Location:
  - `app/api/workdays/route.ts:19-167`
  - `app/api/intervals/route.ts:302-428`
  - `app/api/employees/[id]/earnings/route.ts:70-176`
  - `app/api/clock/route.ts:229-301`

#### Evidence

Во всех этих GET endpoint'ах отсутствует role/permission gate; есть только membership check.

При этом возвращаются чувствительные данные:

- `app/api/workdays/route.ts:52-159`
  - интервалы всех сотрудников,
  - `payComponents`,
  - `customHourlyRateCents`,
  - `customShiftRateCents`,
  - `customPercentRevenueBp`,
  - `clockInPhotoUrl` / `clockOutPhotoUrl`
- `app/api/intervals/route.ts:337-425`
  - schedule,
  - pay components,
  - revenue,
  - time entry photo URLs
- `app/api/employees/[id]/earnings/route.ts:76-89`
  - проверяется только принадлежность employee к organization, но не право текущего пользователя смотреть earnings другого сотрудника
- `app/api/clock/route.ts:270-299`
  - time entries всех сотрудников с photo URLs

#### Impact Details

- Любой worker в организации может читать organization-wide payroll/schedule data.
- Это нарушает least privilege и конфиденциальность зарплат, фото-отметок и operational data.
- В multi-role продукте это быстро превращается в реальный insider risk.

#### Secure-By-Default Fix

- Для org-wide GET endpoints применить RBAC:
  - owner/manager only для payroll, scheduling, clock photos, all-employee views
  - worker only для self-scoped routes (`/api/worker/*`, `/api/auth/me`, личные notifications)
- Для `employees/[id]/earnings` разрешать чужие earnings только management roles.
- Для `clock.GET` скрыть organization-wide выборку от worker role.
- Для worker-facing вариантов вернуть self-only projections без pay components и photo URLs.

#### Mitigation

- Временно можно добавить fast deny:
  - если не owner/manager, отдавать только self-scoped данные,
  - либо `403` для all-employee endpoints.

#### False Positive Notes

- Здесь риск подтверждён кодом: ограничение по `organizationId` есть, ограничения по роли нет.

## Medium Findings

### CRWL-SEC-005

- Rule ID: `CRWL-SEC-005`
- Severity: `Medium`
- Location:
  - `app/api/intervals/route.ts:193-276`
  - `app/api/auth/register/route.ts:69-84`
  - `app/api/cash/settings/route.ts:448-455`
  - similar pattern also appears in several other handlers

#### Evidence

Маршруты возвращают клиенту внутренние DB/runtime детали:

- `app/api/intervals/route.ts:203-249` возвращает `code`, `hint`, `details: meta ?? error.message`
- `app/api/intervals/route.ts:254-275` возвращает `details: error.message` и `String(error)`
- `app/api/auth/register/route.ts:80-83` возвращает `error: message, details: String(error)`
- `app/api/cash/settings/route.ts:449-453` возвращает `details: error.message`

#### Impact Details

- Клиент получает сведения о схеме БД, кодах Prisma, внутренних constraint'ах и runtime text.
- Это упрощает злоумышленнику точный подбор payload'ов и reconnaissance.

#### Secure-By-Default Fix

- Возвращать клиенту только:
  - стабильный public error code,
  - generic message,
  - correlation/request id.
- Полные `error.message`, Prisma codes/meta и stack traces оставлять только в server logs.
- Если нужен DX для dev, делать это через development-only branch.

#### Mitigation

- Минимально безопасный шаг: убрать `details`, `hint`, сырые `error.message` из production responses.

#### False Positive Notes

- Это не RCE само по себе, но это хороший force multiplier для атак и нежелательная утечка internal knowledge.

---

### CRWL-SEC-006

- Rule ID: `CRWL-SEC-006`
- Severity: `Medium`
- Location:
  - `app/api/auth/login/route.ts:11-60`
  - `app/api/worker/venues/join/route.ts:19-183`
  - `infra/caddy/Caddyfile:9-35`

#### Evidence

Не видно ни app-level, ни edge-level rate limiting / throttling:

- `app/api/auth/login/route.ts:11-60` принимает неограниченное количество login attempts.
- `app/api/worker/venues/join/route.ts:19-183` позволяет неограниченно перебирать invite codes.
- В `infra/caddy/Caddyfile:9-35` есть proxy/basic auth, но нет признаков rate limiting или abuse controls.

#### Impact Details

- Упрощается brute force по логину/паролю.
- Упрощается enumeration/guessing invite codes.
- Даже при сильных токенах это повышает стоимость эксплуатации backend и noise level.

#### Secure-By-Default Fix

- Добавить rate limiting по IP + user identifier на:
  - `/api/auth/login`
  - `/api/auth/register`
  - `/api/worker/venues/join`
  - `/api/onboarding/employee`
- Добавить delayed responses / exponential backoff на auth flow.
- Отдельно логировать abusive patterns.

#### Mitigation

- Если правка приложения пока рискованна, поставить лимиты на edge/reverse proxy.

#### False Positive Notes

- Возможно внешние лимиты есть вне репозитория, но они не видны в коде и конфигурации, доступной здесь.

## Low Findings

### CRWL-SEC-007

- Rule ID: `CRWL-SEC-007`
- Severity: `Low`
- Location:
  - `infra/caddy/Caddyfile:9-35`
  - `next.config.mjs:4-19`

#### Evidence

В видимой app/proxy-конфигурации не настроены baseline security headers:

- нет видимого `Content-Security-Policy`
- нет видимого `X-Frame-Options` или `frame-ancestors`
- нет видимого `X-Content-Type-Options`
- нет видимого `Referrer-Policy`

`infra/caddy/Caddyfile:9-35` делает только `basic_auth`, `encode`, `reverse_proxy`.  
`next.config.mjs:11-19` настраивает только rewrite `/api`.

#### Impact Details

- Нет дополнительной browser-side защиты от clickjacking и части XSS-сценариев.
- Любая будущая XSS-ошибка будет иметь больший blast radius.

#### Secure-By-Default Fix

- Добавить baseline headers на proxy или Next level:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy`
  - clickjacking protection через `frame-ancestors` и/или `X-Frame-Options`
- Для CSP начать с `Report-Only`, чтобы не ломать фронт сразу.

#### False Positive Notes

- Эти заголовки могут задаваться внешним CDN/WAF, но в доступной конфигурации это не видно.

## Positive Observations

- Сессии создаются на случайном токене:
  - `lib/auth.ts:19-24`
- Cookie для сессии уже `HttpOnly`, `SameSite=Lax`, `Secure` зависит от environment:
  - `lib/auth.ts:34-43`
  - `lib/session-cookie.ts:15-18`
- По проекту широко используется runtime validation через `zod`.
- Основные сущности в Prisma используют UUID вместо инкрементных публичных id.
- Для invite codes используется hash (`codeHash`) наряду с raw code:
  - `lib/invite-codes.ts:14-17`

## Recommended Remediation Order

1. Закрыть публичные `appState` endpoints или немедленно добавить authz.
2. Ввести централизованный RBAC guard и пройтись по всем mutating org/scheduling endpoints.
3. Ограничить invitation management до owner/manager и убрать raw token из list API.
4. Разделить self-scoped и management-scoped read endpoints.
5. Убрать internal error details из production responses.
6. Добавить rate limiting на auth/invite flows.
7. Включить baseline security headers, начиная с CSP Report-Only.

## Secure-By-Default Improvements That Minimize Breakage

- Вынести один helper уровня `requireOrganizationPermission(session, permission)` и использовать его повсеместно вместо разрозненных ручных проверок.
- Для worker flows не ломать UI полным запретом сразу:
  - сначала сделать self-only projections,
  - потом убрать доступ к org-wide данным.
- Для legacy endpoints (`/api/state/[key]`, `/api/venues/[venueId]/settings`) сначала включить server logging usage, затем закрыть или удалить.
- Для error handling использовать единый formatter: generic client response + structured server log with request id.
- Для security headers сначала выкатить `Report-Only` и собрать нарушения, затем перевести в enforce.

