# Crewlly Internal Admin (`admin.crewlly.com`)

A **separate, read-only** Next.js app for internal platform administration.
Runs as its own container, shares the database and `User`/`Session` tables with the
main `crewlly.com` app.

This is intentionally a **minimal foundation** — the real diagnostic views (org
explorer, audit search, user lookup) will be added in later stages.

## What this app does NOT do

- ❌ No business writes. The admin app cannot edit positions, employees, work
  intervals, cash sessions, etc. To perform those actions, an internal user
  opens the main `crewlly.com` site, starts an internal access session
  (`/internal`), and acts there — those flows are already audit-logged.
- ❌ No new role inside `OrganizationMember`. Internal users still have **no**
  `OrganizationMember` record.
- ❌ No `if (user.isInternal) bypass`. Authorization is `isInternal === true`
  **AND** ≥1 enabled `InternalGlobalAccess` row.

## Architecture

```
                                +----------------------------------+
   browser -- *.crewlly.com -->| Caddy (Basic Auth, TLS)          |
                                +-----+-----------------------+----+
                                      |                       |
                  admin.crewlly.com   v                       v  crewlly.com
                            +------------------+    +---------------------+
                            | internal_admin   |    | front (Next.js)     |
                            | (Next.js, :3002) |    | back  (Next.js)     |
                            +--------+---------+    +----------+----------+
                                     |                         |
                                     +----------+--------------+
                                                v
                                         +-------------+
                                         | Postgres    |
                                         | (shared DB) |
                                         +-------------+
```

Both apps read sessions from the same `sessions` table. A parent-domain cookie
(`Domain=.crewlly.com`) makes `admin.crewlly.com` see the session issued by
`crewlly.com` without requiring a second login.

## Auth flow

1. User logs in at `https://crewlly.com/login` — main app sets the session
   cookie with `Domain=.crewlly.com` (when `SESSION_COOKIE_DOMAIN` is set).
2. User opens `https://admin.crewlly.com`.
3. Admin app reads the cookie → calls `getSessionUser()` → calls
   `resolveAdminAccess()` which requires `user.isInternal === true` AND
   `hasAnyEnabledInternalGrant(user.id)`. Result is gated server-side on every
   page and API route.
4. Logout from either app calls `POST /api/auth/logout` on the main app, which
   deletes the DB row AND clears the parent-domain cookie → both apps lose
   access immediately.

## Code sharing

The admin app imports `lib/auth.ts`, `lib/internal-access/session.ts`, and the
generated Prisma client from the repo root via tsconfig path mapping (see
`tsconfig.json` and `next.config.mjs`). There is **no duplicated** auth or
access-control logic.

## Local dev

```bash
# from repo root
npm install
cd internal-admin && npm install
cd ..

# share the same DB as the main app (already migrated)
SESSION_COOKIE_DOMAIN=  COOKIE_SECURE=false  npm run dev   # main app on :3000
( cd internal-admin && SESSION_COOKIE_DOMAIN=  COOKIE_SECURE=false  npm run dev ) # admin on :3002
```

For local dev, leave `SESSION_COOKIE_DOMAIN` empty — both apps run on
`localhost`, so host-only cookies work between `localhost:3000` and
`localhost:3002` only if they share the same hostname (they do — `localhost`).

## Production

```bash
# build & start both apps + admin
docker compose \
  -f compose.data.yml \
  -f compose.app.yml \
  -f compose.admin.yml \
  -f compose.caddy.yml \
  up -d
```

Required env (in `.env.production`):

```
SESSION_COOKIE_DOMAIN=.crewlly.com
MAIN_APP_URL=https://crewlly.com
ADMIN_APP_URL=https://admin.crewlly.com
CADDY_ADMIN_DOMAIN=admin.crewlly.com
INTERNAL_ADMIN_ENABLED=true
```

## Endpoints

| Path | Auth | Description |
|------|------|-------------|
| `GET /` | internal + grant | The admin shell. |
| `GET /api/health` | public | Container healthcheck — no DB hit. |
| `GET /api/admin/me` | internal + grant | Current admin user + enabled levels. |

## Future improvements (not in this stage)

- **Platform-level audit**: `InternalAuditLog` currently requires
  `organizationId`. A separate `PlatformAuditLog` model (org nullable) would
  let us log `INTERNAL_ADMIN_OPEN` and similar events that are not bound to a
  specific tenant.
- **Stronger admin auth**: WebAuthn / hardware key support, per-action MFA.
- **Real views**: org list, user search, audit-log search, internal session
  history.
